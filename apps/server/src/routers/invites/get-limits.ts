import { Permission } from '@caesar/shared';
import { getUserLimits } from '@server/helpers/user-cap';
import { protectedProcedure } from '@server/utils/trpc';

const getLimitsRoute = protectedProcedure.query(async ({ ctx }) => {
  await ctx.needsPermission(Permission.MANAGE_INVITES);

  return await getUserLimits();
});

export { getLimitsRoute };
