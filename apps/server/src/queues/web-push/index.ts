import { ChannelPermission, hasMention } from '@caesar/shared';
import { pushSubscriptions } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import {
  getAffectedUserIdsForChannel,
  getChannelByIdOrThrow
} from '@server/db/queries/channels';
import { getPublicUserById } from '@server/db/queries/users';
import { logger } from '@server/logger';
import { sendWebPush } from '@server/utils/web-push';
import { getOnlineUserIds } from '@server/utils/wss';
import { inArray } from 'drizzle-orm';
import Queue from 'queue';

const webPushQueue = new Queue({
  concurrency: 2,
  autostart: true,
  timeout: 15_000
});

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
      const [affectedUserIds, channel, sender] = await Promise.all([
        getAffectedUserIdsForChannel(channelId, {
          permission: ChannelPermission.VIEW_CHANNEL
        }),
        getChannelByIdOrThrow(channelId),
        getPublicUserById(messageUserId)
      ]);

      const onlineUserIds = getOnlineUserIds();
      const offlineUserIds = affectedUserIds.filter(
        (id) => id !== messageUserId && !onlineUserIds.includes(id)
      );

      if (offlineUserIds.length === 0) {
        callback?.();
        return;
      }

      const subscriptions = await db
        .select()
        .from(pushSubscriptions)
        .where(inArray(pushSubscriptions.userId, offlineUserIds));

      const senderName = sender?.name ?? 'Unknown';
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

export { enqueueMessagePush };
