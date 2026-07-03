import { OWNER_ROLE_ID } from '@caesar/shared';
import { getUserRoleIds } from '@server/db/queries/roles';
import { invariant } from '@server/utils/invariant';

// Owner protection for user-moderation actions (ban/kick/delete/rename).
// MANAGE_USERS lets a moderator act on members, but a non-owner must never
// be able to touch the server owner: banning locks the owner out with no
// self-serve recovery, deleting is irreversible. Mirrors the guard in
// voice/move-user.ts so every moderation path enforces the same boundary.
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
