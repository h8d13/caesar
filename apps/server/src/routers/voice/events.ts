import {
  ChannelPermission,
  ServerEvents,
  type StreamKind,
  type TChannelAccess
} from '@caesar/shared';
import { getChannelAccessRow } from '@server/db/queries/channels';
import { logger } from '@server/logger';
import { VoiceRuntime } from '@server/runtimes/voice';
import type { Events } from '@server/utils/pubsub';
import { type Context, protectedProcedure } from '@server/utils/trpc';
import { observable } from '@trpc/server/observable';

type TVoiceProducerEvent = {
  channelId: number;
  remoteId: number;
  kind: StreamKind;
};

// Subscribe across all channels and filter per event. The ctx is the
// per-WS shared object that `join.ts` mutates, so reading
// currentVoiceChannelId inside the listener picks up the channelId set
// after this subscription was opened, closing the race where a sub
// requested concurrently with the join mutation would otherwise capture
// undefined at handler-time and stay dead.
//
// Access is re-verified per event against the live channel ACLs (not
// just trusted from the join-time check): permissions can be revoked
// while a user is still in voice, and the equality with
// currentVoiceChannelId alone wouldn't reflect that.
//
// One publish hands the same payload object to every listener, so keying
// on it reads the channel row once per event instead of once per socket in
// the channel. Each user's own grants are still resolved per event.
const channelByEvent = new WeakMap<
  object,
  Promise<TChannelAccess | undefined>
>();

const getEventChannel = (data: { channelId: number }) => {
  let channel = channelByEvent.get(data);

  if (!channel)
    channelByEvent.set(data, (channel = getChannelAccessRow(data.channelId)));

  return channel;
};

// A listener runs detached from any request: a rejected lookup (a busy
// database) would be an unhandled rejection, which exits the process. The
// event is dropped instead.
const deliverIf = async (
  allowed: () => Promise<boolean>,
  deliver: () => void,
  topic: string
) => {
  try {
    if (await allowed()) deliver();
  } catch (error) {
    logger.error(`[Voice] dropped ${topic} event:`, error);
  }
};

const subscribeVoiceProducerEvent = (
  topic:
    | typeof ServerEvents.VOICE_NEW_PRODUCER
    | typeof ServerEvents.VOICE_PRODUCER_CLOSED,
  ctx: Context
) =>
  observable<TVoiceProducerEvent>((observer) => {
    const sub = ctx.pubsub.subscribeAcrossChannels(topic).subscribe({
      next: (data) => {
        if (data.channelId !== ctx.currentVoiceChannelId) return;

        void deliverIf(
          async () =>
            ctx.hasChannelPermission(data.channelId, ChannelPermission.JOIN, {
              channel: await getEventChannel(data)
            }),
          () => observer.next(data),
          topic
        );
      }
    });
    return () => sub.unsubscribe();
  });

// Presence (who is in which voice channel, their mute/cam state) follows
// channel visibility: a private channel's occupants reach only users who
// can view it, a DM call only its two participants. The user an event is
// about always gets it, so someone removed from a channel they can no
// longer see still learns they left.
type TVoicePresenceEvent = { channelId: number; userId?: number };

const subscribeVoicePresenceEvent = <
  TTopic extends
    | typeof ServerEvents.USER_JOIN_VOICE
    | typeof ServerEvents.USER_LEAVE_VOICE
    | typeof ServerEvents.USER_VOICE_STATE_UPDATE
    | typeof ServerEvents.VOICE_CHANNEL_STATE_UPDATE
>(
  topic: TTopic,
  ctx: Context
) =>
  observable<Events[TTopic]>((observer) => {
    const sub = ctx.pubsub.subscribe(topic).subscribe({
      next: (data: Events[TTopic]) => {
        const event: TVoicePresenceEvent = data;

        if (event.userId === ctx.userId) {
          observer.next(data);
          return;
        }

        void deliverIf(
          async () =>
            ctx.hasChannelPermission(
              event.channelId,
              ChannelPermission.VIEW_CHANNEL,
              { channel: await getEventChannel(event) }
            ),
          () => observer.next(data),
          topic
        );
      }
    });

    return () => sub.unsubscribe();
  });

const onUserJoinVoiceRoute = protectedProcedure.subscription(async ({ ctx }) =>
  subscribeVoicePresenceEvent(ServerEvents.USER_JOIN_VOICE, ctx)
);

const onUserLeaveVoiceRoute = protectedProcedure.subscription(async ({ ctx }) =>
  subscribeVoicePresenceEvent(ServerEvents.USER_LEAVE_VOICE, ctx)
);

const onUserUpdateVoiceStateRoute = protectedProcedure.subscription(
  async ({ ctx }) =>
    subscribeVoicePresenceEvent(ServerEvents.USER_VOICE_STATE_UPDATE, ctx)
);

// Targeted: only the moved user receives this (publishFor).
const onForceMoveRoute = protectedProcedure.subscription(async ({ ctx }) => {
  return ctx.pubsub.subscribeFor(ctx.userId, ServerEvents.VOICE_FORCE_MOVE);
});

const onVoiceChannelStateUpdateRoute = protectedProcedure.subscription(
  async ({ ctx }) =>
    subscribeVoicePresenceEvent(ServerEvents.VOICE_CHANNEL_STATE_UPDATE, ctx)
);

// these events are channel-scoped (only sent to users in the same voice channel)
// they relate to actual media streaming, not UI state
const onVoiceNewProducerRoute = protectedProcedure.subscription(
  async ({ ctx }) =>
    subscribeVoiceProducerEvent(ServerEvents.VOICE_NEW_PRODUCER, ctx)
);

// only the room the sound was played in hears it
const onSoundboardPlayRoute = protectedProcedure.subscription(async ({ ctx }) =>
  observable<Events[typeof ServerEvents.SOUNDBOARD_PLAY]>((observer) => {
    const sub = ctx.pubsub.subscribe(ServerEvents.SOUNDBOARD_PLAY).subscribe({
      next: (data) => {
        // the socket's channel id alone is a claim: a user removed from the
        // room by a sweep keeps it until their next voice call
        if (
          data.channelId === ctx.currentVoiceChannelId &&
          VoiceRuntime.findById(data.channelId)?.getUser(ctx.userId)
        ) {
          observer.next(data);
        }
      }
    });

    return () => sub.unsubscribe();
  })
);

const onVoiceProducerClosedRoute = protectedProcedure.subscription(
  async ({ ctx }) =>
    subscribeVoiceProducerEvent(ServerEvents.VOICE_PRODUCER_CLOSED, ctx)
);

export {
  onForceMoveRoute,
  onSoundboardPlayRoute,
  onUserJoinVoiceRoute,
  onUserLeaveVoiceRoute,
  onUserUpdateVoiceStateRoute,
  onVoiceChannelStateUpdateRoute,
  onVoiceNewProducerRoute,
  onVoiceProducerClosedRoute
};
