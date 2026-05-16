import { ServerEvents } from '@caesar/shared';
import { protectedProcedure } from '@server/utils/trpc';

const onServerSettingsUpdateRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribe(ServerEvents.SERVER_SETTINGS_UPDATE);
  }
);

export { onServerSettingsUpdateRoute };
