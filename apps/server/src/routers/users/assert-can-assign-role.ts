import { OWNER_ROLE_ID, type Permission } from '@caesar/shared';
import { getRole } from '@server/db/queries/roles';
import { invariant } from '@server/utils/invariant';
import { getUserRoles } from './get-user-roles';

// Privilege-escalation guard. MANAGE_USERS / MANAGE_ROLES / MANAGE_INVITES
// all hand out permissions (assign a role, edit a role, invite into a
// role); none of them may grant a permission the actor doesn't hold,
// otherwise any one of them becomes a path to full admin.
// Owner bypasses: the owner implicitly holds every permission.
//
// Note: the owner role itself is guarded separately by
// assertCanModifyOwnerRole. The owner role's stored permissions are a
// snapshot and not the source of truth for owner power, so the subset
// check below is not sufficient to protect it on its own.
const assertCanGrantPermissions = async (
  actorUserId: number,
  permissions: Permission[]
) => {
  const actorRoles = await getUserRoles(actorUserId);

  if (actorRoles.some((role) => role.id === OWNER_ROLE_ID)) return;

  const actorPermissions = new Set<Permission>();

  for (const actorRole of actorRoles) {
    for (const permission of actorRole.permissions) {
      actorPermissions.add(permission);
    }
  }

  const grantsMissingPermission = permissions.some(
    (permission) => !actorPermissions.has(permission)
  );

  invariant(!grantsMissingPermission, {
    code: 'FORBIDDEN',
    message: 'You cannot grant permissions you do not have.'
  });
};

const assertCanAssignRole = async (actorUserId: number, roleId: number) => {
  const role = await getRole(roleId);

  invariant(role, { code: 'NOT_FOUND', message: 'Role not found' });

  await assertCanGrantPermissions(actorUserId, role.permissions);
};

export { assertCanAssignRole, assertCanGrantPermissions };
