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
const canGrantPermissions = async (
  actorUserId: number,
  permissions: Permission[]
): Promise<boolean> => {
  const actorRoles = await getUserRoles(actorUserId);

  if (actorRoles.some((role) => role.id === OWNER_ROLE_ID)) return true;

  const actorPermissions = new Set<Permission>();

  for (const actorRole of actorRoles) {
    for (const permission of actorRole.permissions) {
      actorPermissions.add(permission);
    }
  }

  return permissions.every((permission) => actorPermissions.has(permission));
};

const assertCanGrantPermissions = async (
  actorUserId: number,
  permissions: Permission[]
) => {
  invariant(await canGrantPermissions(actorUserId, permissions), {
    code: 'FORBIDDEN',
    message: 'You cannot grant permissions you do not have.'
  });
};

// Non-throwing form for a role id: false for a missing role too.
const canAssignRole = async (
  actorUserId: number,
  roleId: number
): Promise<boolean> => {
  if (roleId === OWNER_ROLE_ID) return false;

  const role = await getRole(roleId);

  return !!role && canGrantPermissions(actorUserId, role.permissions);
};

const assertCanAssignRole = async (actorUserId: number, roleId: number) => {
  const role = await getRole(roleId);

  invariant(role, { code: 'NOT_FOUND', message: 'Role not found' });

  await assertCanGrantPermissions(actorUserId, role.permissions);
};

// The role ids among `roleIds` the actor could not assign, each checked
// once: for listings that mention the same few roles many times.
const getUnassignableRoleIds = async (
  actorUserId: number,
  roleIds: Iterable<number | null | undefined>
): Promise<Set<number>> => {
  const unassignable = new Set<number>();
  const checked = new Set<number>();

  for (const roleId of roleIds) {
    if (!roleId || checked.has(roleId)) continue;

    checked.add(roleId);

    if (!(await canAssignRole(actorUserId, roleId))) unassignable.add(roleId);
  }

  return unassignable;
};

export {
  assertCanAssignRole,
  assertCanGrantPermissions,
  canAssignRole,
  canGrantPermissions,
  getUnassignableRoleIds
};
