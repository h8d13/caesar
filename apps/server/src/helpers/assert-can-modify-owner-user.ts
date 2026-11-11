import { OWNER_ROLE_ID } from '@caesar/shared';
import { getUserRoleIds } from '@server/db/queries/roles';
import { canGrantPermissions } from '@server/routers/users/assert-can-assign-role';
import { getUserRoles } from '@server/routers/users/get-user-roles';
import { invariant } from '@server/utils/invariant';

// Owner protection for every moderation path on a user (ban, kick, delete,
// rename, reset password, role add/remove, voice move, deleting their
// messages or files). A non-owner must never touch the server owner:
// banning locks the owner out with no self-serve recovery, deleting is
// irreversible.
const assertCanModifyOwnerUser = async (
  actorUserId: number,
  targetUserId: number,
  action: string
) => {
  const targetRoleIds = await getUserRoleIds(targetUserId);

  if (!targetRoleIds.includes(OWNER_ROLE_ID)) return;

  const actorRoleIds = await getUserRoleIds(actorUserId);

  invariant(actorRoleIds.includes(OWNER_ROLE_ID), {
    code: 'FORBIDDEN',
    message: `You cannot ${action} the server owner.`
  });
};

// Reset password and rename identity return a login for the target, so
// MANAGE_USERS alone would let a moderator sign in as anyone short of the
// owner and inherit what they hold. The actor must already hold every
// permission of the target (an owner holds them all).
const assertCanTakeOverUser = async (
  actorUserId: number,
  targetUserId: number,
  action: string
) => {
  const targetRoles = await getUserRoles(targetUserId);
  const outranked =
    targetRoles.some((role) => role.id === OWNER_ROLE_ID) ||
    !(await canGrantPermissions(
      actorUserId,
      targetRoles.flatMap((role) => role.permissions)
    ));

  invariant(!outranked, {
    code: 'FORBIDDEN',
    message: `You cannot ${action} a user who holds permissions you do not have.`
  });
};

export { assertCanModifyOwnerUser, assertCanTakeOverUser };
