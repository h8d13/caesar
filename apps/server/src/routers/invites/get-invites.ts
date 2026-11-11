import { Permission } from '@caesar/shared';
import { getInvites } from '@server/db/queries/invites';
import { getUnassignableRoleIds } from '@server/routers/users/assert-can-assign-role';
import { protectedProcedure } from '@server/utils/trpc';

const getInvitesRoute = protectedProcedure.query(async ({ ctx }) => {
  await ctx.needsPermission(Permission.MANAGE_INVITES);

  const invites = await getInvites();

  // The code of an invite that carries a role is that role for whoever
  // signs up with it. A viewer who could not create such an invite does not
  // get to read someone else's: the row stays (it can still be deleted),
  // the code is blanked.
  const unassignable = await getUnassignableRoleIds(
    ctx.userId,
    invites.map((invite) => invite.roleId)
  );

  return invites.map((invite) =>
    invite.roleId && unassignable.has(invite.roleId)
      ? { ...invite, code: '' }
      : invite
  );
});

export { getInvitesRoute };
