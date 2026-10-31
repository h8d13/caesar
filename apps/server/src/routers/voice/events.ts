import {
  ChannelPermission,
  ServerEvents,
  type StreamKind,
  type TChannelAccess
} from '@caesar/shared';
import { getChannelAccessRow } from '@server/db/queries/channels';
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
  TVoiceProducerEvent,
  Promise<TChannelAccess | undefined>
>();

const getEventChannel = (data: TVoiceProducerEvent) => {
  let channel = channelByEvent.get(data);

  if (!channel)
    channelByEvent.set(data, (channel = getChannelAccessRow(data.channelId)));

  return channel;
};

const subscribeVoiceProducerEvent = (
  topic:
    | typeof ServerEvents.VOICE_NEW_PRODUCER
    | typeof ServerEvents.VOICE_PRODUCER_CLOSED,
  ctx: Context
) =>
  observable<TVoiceProducerEvent>((observer) => {
    const sub = ctx.pubsub.subscribeAcrossChannels(topic).subscribe({
      next: async (data) => {
        if (data.channelId !== ctx.currentVoiceChannelId) return;
        const channel = await getEventChannel(data);
        const allowed = await ctx.hasChannelPermission(
          data.channelId,
          ChannelPermission.JOIN,
          { channel }
        );
        if (!allowed) return;
        observer.next(data);
      }
    });
    return () => sub.unsubscribe();
  });

// these events are broadcast to ALL users (for UI population in the sidebar)
const onUserJoinVoiceRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribe(ServerEvents.USER_JOIN_VOICE);
  }
);

const onUserLeaveVoiceRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribe(ServerEvents.USER_LEAVE_VOICE);
  }
);

const onUserUpdateVoiceStateRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribe(ServerEvents.USER_VOICE_STATE_UPDATE);
  }
);

// Targeted: only the moved user receives this (publishFor).
const onForceMoveRoute = protectedProcedure.subscription(async ({ ctx }) => {
  return ctx.pubsub.subscribeFor(ctx.userId, ServerEvents.VOICE_FORCE_MOVE);
});

const onVoiceChannelStateUpdateRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribe(ServerEvents.VOICE_CHANNEL_STATE_UPDATE);
  }
);

// these events are channel-scoped (only sent to users in the same voice channel)
// they relate to actual media streaming, not UI state
const onVoiceNewProducerRoute = protectedProcedure.subscription(
  async ({ ctx }) =>
    subscribeVoiceProducerEvent(ServerEvents.VOICE_NEW_PRODUCER, ctx)
);

const onSoundboardPlayRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribe(ServerEvents.SOUNDBOARD_PLAY);
  }
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
