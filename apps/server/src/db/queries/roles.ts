import type { Permission, TJoinedRole, TRole } from '@caesar/shared';
import { rolePermissions, roles, userRoles } from '@caesar/shared/db/schema';
import { and, eq, getTableColumns, sql } from 'drizzle-orm';
import { db } from '..';
import { prepared } from '../prepared';
type TQueryResult = TRole & {
  permissions: string | null;
};

const roleSelectFields = {
  ...getTableColumns(roles),
  permissions: sql<string>`group_concat(${rolePermissions.permission}, ',')`.as(
    'permissions'
  )
};

const parseRole = (role: TQueryResult): TJoinedRole => ({
  ...role,
  permissions: role.permissions
    ? (role.permissions.split(',') as Permission[])
    : []
});

const getDefaultRole = async (): Promise<TRole | undefined> =>
  await db.select().from(roles).where(eq(roles.isDefault, true)).get();

const getRole = async (roleId: number): Promise<TJoinedRole | undefined> => {
  const role = await db
    .select(roleSelectFields)
    .from(roles)
    .leftJoin(rolePermissions, sql`${roles.id} = ${rolePermissions.roleId}`)
    .where(sql`${roles.id} = ${roleId}`)
    .groupBy(roles.id)
    .limit(1)
    .get();

  if (!role) return undefined;

  return parseRole(role);
};

const rolesQuery = prepared(() =>
  db
    .select(roleSelectFields)
    .from(roles)
    .leftJoin(rolePermissions, sql`${roles.id} = ${rolePermissions.roleId}`)
    .groupBy(roles.id)
);

// also a subquery: keeps the role-permission queries a fixed shape
const userRoleIdsSelect = () =>
  db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, sql.placeholder('userId')));

const userRoleIdsQuery = prepared(userRoleIdsSelect);

const getRoles = async (): Promise<TJoinedRole[]> => {
  const results = await rolesQuery().all();

  return results.map(parseRole);
};

const getUserRoleIds = async (userId: number): Promise<number[]> => {
  const userRoleRecords = await userRoleIdsQuery().all({ userId });

  return userRoleRecords.map((ur) => ur.roleId);
};

// Bulk equivalent of getUserRoleIds for queries that need to attach
// roleIds to a list of users (or any join over user_roles). Returns a
// Record<userId, roleId[]>; missing userIds default to [] at the call
// site via `map[id] ?? []`.
const getAllUserRoleIdsMap = async (): Promise<Record<number, number[]>> => {
  const rolesByUser = await db
    .select({
      userId: userRoles.userId,
      roleId: userRoles.roleId
    })
    .from(userRoles)
    .all();

  return rolesByUser.reduce(
    (acc, { userId, roleId }) => {
      if (!acc[userId]) acc[userId] = [];
      acc[userId].push(roleId);
      return acc;
    },
    {} as Record<number, number[]>
  );
};

const getEffectiveStorageSpaceQuotaByUserId = async (
  userId: number,
  fallbackQuota: number
): Promise<number> => {
  const overrideRoles = await db
    .select({ storageSpaceQuota: roles.storageSpaceQuota })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(roles.storageQuotaOverrideEnabled, true)
      )
    );

  if (overrideRoles.length === 0) {
    return fallbackQuota;
  }

  if (overrideRoles.some((role) => role.storageSpaceQuota === 0)) {
    return 0;
  }

  return Math.max(...overrideRoles.map((role) => role.storageSpaceQuota));
};

export {
  getAllUserRoleIdsMap,
  getDefaultRole,
  getEffectiveStorageSpaceQuotaByUserId,
  getRole,
  getRoles,
  getUserRoleIds,
  userRoleIdsSelect
};
