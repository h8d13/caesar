import type { Permission, TJoinedRole } from '@caesar/shared';
import { rolePermissions, roles, userRoles } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { prepared } from '@server/db/prepared';
import { eq, sql } from 'drizzle-orm';

// runs on every ctx.hasPermission, so every voice procedure call
const userRolesQuery = prepared(() =>
  db
    .select({
      role: roles,
      permission: rolePermissions.permission
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .leftJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
    .where(eq(userRoles.userId, sql.placeholder('userId')))
);

const getUserRoles = async (userId: number): Promise<TJoinedRole[]> => {
  const result = await userRolesQuery().all({ userId });

  if (result.length === 0) return [];

  const rolesMap = new Map<number, TJoinedRole>();

  for (const row of result) {
    const roleId = row.role.id;

    if (!rolesMap.has(roleId)) {
      rolesMap.set(roleId, {
        ...row.role,
        permissions: []
      });
    }

    if (row.permission) {
      rolesMap.get(roleId)!.permissions.push(row.permission as Permission);
    }
  }

  return Array.from(rolesMap.values());
};

export { getUserRoles };
