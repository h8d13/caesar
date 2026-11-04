import { OWNER_ROLE_ID } from '@caesar/shared';
import { getUserRoleIds } from '@server/db/queries/roles';
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

export { assertCanModifyOwnerUser };
