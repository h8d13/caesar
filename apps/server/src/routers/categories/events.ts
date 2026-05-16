import { ServerEvents } from '@caesar/shared';
import { protectedProcedure } from '@server/utils/trpc';

const onCategoryCreateRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribe(ServerEvents.CATEGORY_CREATE);
  }
);

const onCategoryDeleteRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribe(ServerEvents.CATEGORY_DELETE);
  }
);

const onCategoryUpdateRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribe(ServerEvents.CATEGORY_UPDATE);
  }
);

export { onCategoryCreateRoute, onCategoryDeleteRoute, onCategoryUpdateRoute };
