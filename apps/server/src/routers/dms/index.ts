import { ServerEvents } from '@caesar/shared';
import { protectedProcedure, t } from '@server/utils/trpc';
import { acceptCallRoute } from './accept-call';
import { callRoute } from './call';
import { getDirectMessagesRoute } from './get-direct-messages';
import { getE2eeContextRoute } from './get-e2ee-context';
import { getEphemeralRoute } from './get-ephemeral';
import { hangupCallRoute } from './hangup-call';
import { openDirectMessageRoute } from './open-direct-message';
import { setEphemeralRoute } from './set-ephemeral';

const onDmConversationOpenRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribeFor(
      ctx.userId,
      ServerEvents.DM_CONVERSATION_OPEN
    );
  }
);

const onDmEphemeralUpdateRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribeFor(
      ctx.userId,
      ServerEvents.DM_EPHEMERAL_UPDATE
    );
  }
);

const onCallRingRoute = protectedProcedure.subscription(async ({ ctx }) => {
  return ctx.pubsub.subscribeFor(ctx.userId, ServerEvents.DM_CALL_RING);
});

const onCallAcceptedRoute = protectedProcedure.subscription(async ({ ctx }) => {
  return ctx.pubsub.subscribeFor(ctx.userId, ServerEvents.DM_CALL_ACCEPTED);
});

const onCallEndedRoute = protectedProcedure.subscription(async ({ ctx }) => {
  return ctx.pubsub.subscribeFor(ctx.userId, ServerEvents.DM_CALL_ENDED);
});

export const dmsRouter = t.router({
  get: getDirectMessagesRoute,
  open: openDirectMessageRoute,
  getEphemeral: getEphemeralRoute,
  getE2eeContext: getE2eeContextRoute,
  setEphemeral: setEphemeralRoute,
  call: callRoute,
  acceptCall: acceptCallRoute,
  hangupCall: hangupCallRoute,
  onConversationOpen: onDmConversationOpenRoute,
  onEphemeralUpdate: onDmEphemeralUpdateRoute,
  onCallRing: onCallRingRoute,
  onCallAccepted: onCallAcceptedRoute,
  onCallEnded: onCallEndedRoute
});
