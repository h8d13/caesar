import { ServerEvents } from '@caesar/shared';
import { protectedProcedure, t } from '@server/utils/trpc';
import { getDirectMessagesRoute } from './get-direct-messages';
import { getEphemeralRoute } from './get-ephemeral';
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

export const dmsRouter = t.router({
  get: getDirectMessagesRoute,
  open: openDirectMessageRoute,
  getEphemeral: getEphemeralRoute,
  setEphemeral: setEphemeralRoute,
  onConversationOpen: onDmConversationOpenRoute,
  onEphemeralUpdate: onDmEphemeralUpdateRoute
});
