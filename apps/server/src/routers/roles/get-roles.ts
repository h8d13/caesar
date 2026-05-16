import { Permission } from '@caesar/shared';
import { getRoles } from '@server/db/queries/roles';
import { protectedProcedure } from '@server/utils/trpc';

const getRolesRouter = protectedProcedure.query(async ({ ctx }) => {
  await ctx.needsPermission(Permission.MANAGE_ROLES);

  const roles = await getRoles();

  return roles;
});

export { getRolesRouter };
