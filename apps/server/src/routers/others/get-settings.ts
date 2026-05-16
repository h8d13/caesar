import { Permission } from '@caesar/shared';
import { getSettings } from '@server/db/queries/server';
import { protectedProcedure } from '@server/utils/trpc';

const getSettingsRoute = protectedProcedure.query(async ({ ctx }) => {
  await ctx.needsPermission(Permission.MANAGE_SETTINGS);

  const settings = await getSettings();

  return settings;
});

export { getSettingsRoute };
