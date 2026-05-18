import { ServerEvents } from '@caesar/shared';
import { protectedProcedure } from '@server/utils/trpc';

const onMyLoginRoute = protectedProcedure.subscription(async ({ ctx }) => {
  return ctx.pubsub.subscribeFor(ctx.userId, ServerEvents.USER_LOGIN_RECORDED);
});

export { onMyLoginRoute };
