import { ChannelPermission, hasMention } from '@caesar/shared';
import { pushSubscriptions, users } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import {
  getChannelAudience,
  getChannelByIdOrThrow
} from '@server/db/queries/channels';
import { logger } from '@server/logger';
import { sendWebPush } from '@server/utils/web-push';
import { getOnlineUserIds } from '@server/utils/wss';
import { eq, inArray } from 'drizzle-orm';
import Queue from 'queue';

const webPushQueue = new Queue({
  concurrency: 2,
  autostart: true,
  timeout: 15_000
});

const getUserName = async (userId: number) => {
  const user = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  return user?.name ?? 'Unknown';
};

const selectSubscriptions = async (userIds: number[]) =>
  userIds.length === 0
    ? []
    : db
        .select()
        .from(pushSubscriptions)
        .where(inArray(pushSubscriptions.userId, userIds));

type TEnqueueMessagePush = {
  channelId: number;
  messageUserId: number;
  content: string | null;
};

// Web Push fan-out for a newly created message. Only users with no live
// WS connection are pushed (connected clients get the in-app
// notification); each stored subscription applies its own prefs mirror
// (all / mentions / DMs), same precedence as the client.
//
// Payload stays generic on purpose: content can be E2EE ciphertext and
// even plaintext must not reach lock screens / notification daemons.
const enqueueMessagePush = ({
  channelId,
  messageUserId,
  content
}: TEnqueueMessagePush) => {
  webPushQueue.push(async (callback) => {
    try {
      const channel = await getChannelByIdOrThrow(channelId);
      const audience = await getChannelAudience(channelId, {
        permission: ChannelPermission.VIEW_CHANNEL,
        channel
      });

      const onlineUserIds = new Set(getOnlineUserIds());
      const isRecipient = (userId: number) =>
        userId !== messageUserId && !onlineUserIds.has(userId);

      // "everyone": subscriptions are far fewer rows than users, so read
      // them all and filter here instead of binding every offline user id
      const subscriptions =
        audience === 'everyone'
          ? (await db.select().from(pushSubscriptions)).filter((sub) =>
              isRecipient(sub.userId)
            )
          : await selectSubscriptions(audience.filter(isRecipient));

      if (subscriptions.length === 0) {
        callback?.();
        return;
      }

      const senderName = await getUserName(messageUserId);
      const title = channel.isDm
        ? senderName
        : `${senderName} in #${channel.name}`;
      const payload = { title, body: 'You have a new message.' };

      const goneEndpoints: string[] = [];

      await Promise.all(
        subscriptions.map(async (sub) => {
          const wanted =
            sub.notifyAll ||
            (sub.notifyMentions && hasMention(content, sub.userId)) ||
            (sub.notifyDms && channel.isDm);

          if (!wanted) return;

          const result = await sendWebPush(sub, payload);

          if (result === 'gone') {
            goneEndpoints.push(sub.endpoint);
          }
        })
      );

      if (goneEndpoints.length > 0) {
        await db
          .delete(pushSubscriptions)
          .where(inArray(pushSubscriptions.endpoint, goneEndpoints));
      }
    } catch (error) {
      logger.error('[Push] message fan-out failed:', error);
    }

    callback?.();
  });
};

type TEnqueueCallPush = {
  callerId: number;
  peerId: number;
};

// ring window on the caller side; a push held longer than this by the
// push service would arrive after the call stopped ringing
const CALL_PUSH_TTL_SECONDS = 60;

// Web Push for an incoming 1:1 DM call. Same offline-only rule as
// messages (a connected client rings in-app via DM_CALL_RING); gated by
// the DM prefs since a call is a DM event. High urgency + short TTL:
// wake the device now or not at all.
const enqueueCallPush = ({ callerId, peerId }: TEnqueueCallPush) => {
  webPushQueue.push(async (callback) => {
    try {
      if (getOnlineUserIds().includes(peerId)) {
        callback?.();
        return;
      }

      const [subscriptions, callerName] = await Promise.all([
        selectSubscriptions([peerId]),
        getUserName(callerId)
      ]);

      const payload = {
        title: callerName,
        body: 'Incoming call.'
      };

      const goneEndpoints: string[] = [];

      await Promise.all(
        subscriptions.map(async (sub) => {
          if (!sub.notifyAll && !sub.notifyDms) return;

          const result = await sendWebPush(sub, payload, {
            ttl: CALL_PUSH_TTL_SECONDS,
            urgency: 'high'
          });

          if (result === 'gone') {
            goneEndpoints.push(sub.endpoint);
          }
        })
      );

      if (goneEndpoints.length > 0) {
        await db
          .delete(pushSubscriptions)
          .where(inArray(pushSubscriptions.endpoint, goneEndpoints));
      }
    } catch (error) {
      logger.error('[Push] call fan-out failed:', error);
    }

    callback?.();
  });
};

export { enqueueCallPush, enqueueMessagePush };
