import { ServerEvents } from '@caesar/shared';
import { protectedProcedure } from '@server/utils/trpc';

const onEmojiCreateRoute = protectedProcedure.subscription(async ({ ctx }) => {
  return ctx.pubsub.subscribe(ServerEvents.EMOJI_CREATE);
});

const onEmojiDeleteRoute = protectedProcedure.subscription(async ({ ctx }) => {
  return ctx.pubsub.subscribe(ServerEvents.EMOJI_DELETE);
});

const onEmojiUpdateRoute = protectedProcedure.subscription(async ({ ctx }) => {
  return ctx.pubsub.subscribe(ServerEvents.EMOJI_UPDATE);
});

export { onEmojiCreateRoute, onEmojiDeleteRoute, onEmojiUpdateRoute };
