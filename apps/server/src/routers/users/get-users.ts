import { Permission } from '@caesar/shared';
import { getUsers } from '@server/db/queries/users';
import { clearFields } from '@server/helpers/clear-fields';
import { protectedProcedure } from '@server/utils/trpc';

const getUsersRoute = protectedProcedure.query(async ({ ctx }) => {
  await ctx.needsPermission(Permission.MANAGE_USERS);

  const users = await getUsers();

  return clearFields(users, ['identity', 'password']);
});

export { getUsersRoute };
