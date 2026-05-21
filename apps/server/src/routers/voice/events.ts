import { ServerEvents, type StreamKind } from '@caesar/shared';
import { type Context, protectedProcedure } from '@server/utils/trpc';
import { observable } from '@trpc/server/observable';

type TVoiceProducerEvent = {
  channelId: number;
  remoteId: number;
  kind: StreamKind;
};

// Subscribe across all channels and filter by ctx.currentVoiceChannelId
// per event. The ctx is the per-WS shared object that `join.ts` mutates,
// so reading it inside the listener picks up the channelId set after
// this subscription was opened, avoiding the race where a subscription
// requested concurrently with the join mutation captures an undefined
// channelId at handler-time and gets stuck with a dead observable.
const subscribeVoiceProducerEvent = (
  topic:
    | typeof ServerEvents.VOICE_NEW_PRODUCER
    | typeof ServerEvents.VOICE_PRODUCER_CLOSED,
  ctx: Context
) =>
  observable<TVoiceProducerEvent>((observer) => {
    const sub = ctx.pubsub.subscribeAcrossChannels(topic).subscribe({
      next: (data) => {
        if (data.channelId === ctx.currentVoiceChannelId) {
          observer.next(data);
        }
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

const onVoiceChannelStateUpdateRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribe(ServerEvents.VOICE_CHANNEL_STATE_UPDATE);
  }
);

// these events are broadcast to ALL users (for external stream UI in the sidebar)
const onVoiceAddExternalStreamRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribe(ServerEvents.VOICE_ADD_EXTERNAL_STREAM);
  }
);

const onVoiceUpdateExternalStreamRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribe(ServerEvents.VOICE_UPDATE_EXTERNAL_STREAM);
  }
);

const onVoiceRemoveExternalStreamRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribe(ServerEvents.VOICE_REMOVE_EXTERNAL_STREAM);
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
  onSoundboardPlayRoute,
  onUserJoinVoiceRoute,
  onUserLeaveVoiceRoute,
  onUserUpdateVoiceStateRoute,
  onVoiceAddExternalStreamRoute,
  onVoiceChannelStateUpdateRoute,
  onVoiceNewProducerRoute,
  onVoiceProducerClosedRoute,
  onVoiceRemoveExternalStreamRoute,
  onVoiceUpdateExternalStreamRoute
};
