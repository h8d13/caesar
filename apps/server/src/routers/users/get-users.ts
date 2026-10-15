import { Permission } from '@caesar/shared';
import { getUsers } from '@server/db/queries/users';
import { clearFields } from '@server/helpers/clear-fields';
import { protectedProcedure } from '@server/utils/trpc';

const getUsersRoute = protectedProcedure.query(async ({ ctx }) => {
  await ctx.needsPermission(Permission.MANAGE_USERS);

  const users = clearFields(await getUsers(), ['identity', 'password']);

  // a code may still be live: only those who already see codes get it
  if (await ctx.hasPermission(Permission.MANAGE_INVITES)) return users;

  return clearFields(users, ['inviteCode']);
});

export { getUsersRoute };
