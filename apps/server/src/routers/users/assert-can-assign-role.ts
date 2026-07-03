import { OWNER_ROLE_ID, type Permission } from '@caesar/shared';
import { getRole } from '@server/db/queries/roles';
import { invariant } from '@server/utils/invariant';
import { getUserRoles } from './get-user-roles';

// Privilege-escalation guard for role assignment. MANAGE_USERS lets a
// moderator assign roles, but they must not be able to grant permissions
// they don't themselves hold: otherwise MANAGE_USERS alone becomes a path
// to full admin (grant self a role carrying MANAGE_ROLES/MANAGE_SETTINGS).
// Owner bypasses: the owner implicitly holds every permission.
//
// Note: the owner role itself is guarded separately by
// assertCanModifyOwnerRole. The owner role's stored permissions are a
// snapshot and not the source of truth for owner power, so the subset
// check below is not sufficient to protect it on its own.
const assertCanAssignRole = async (actorUserId: number, roleId: number) => {
  const actorRoles = await getUserRoles(actorUserId);

  if (actorRoles.some((role) => role.id === OWNER_ROLE_ID)) return;

  const role = await getRole(roleId);

  invariant(role, { code: 'NOT_FOUND', message: 'Role not found' });

  const actorPermissions = new Set<Permission>();

  for (const actorRole of actorRoles) {
    for (const permission of actorRole.permissions) {
      actorPermissions.add(permission);
    }
  }

  const grantsMissingPermission = role.permissions.some(
    (permission) => !actorPermissions.has(permission)
  );

  invariant(!grantsMissingPermission, {
    code: 'FORBIDDEN',
    message: 'You cannot assign a role that grants permissions you do not have.'
  });
};

export { assertCanAssignRole };
