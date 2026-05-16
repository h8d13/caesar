import { Permission } from '@caesar/shared';
import { getSounds } from '@server/db/queries/sounds';
import { protectedProcedure } from '@server/utils/trpc';

const getSoundsRoute = protectedProcedure.query(async ({ ctx }) => {
  await ctx.needsPermission(Permission.MANAGE_SOUNDS);

  const sounds = await getSounds();

  return sounds;
});

export { getSoundsRoute };
