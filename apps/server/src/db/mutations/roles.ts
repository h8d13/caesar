import type { Permission } from '@caesar/shared';
import { rolePermissions } from '@caesar/shared/db/schema';
import { eq } from 'drizzle-orm';
import { type db } from '..';

type TTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Replaces a role's permission set. Runs in the caller's transaction so a
// role row and its permissions are written together.
const syncRolePermissions = async (
  tx: TTransaction,
  roleId: number,
  permissions: Permission[]
) => {
  await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));

  if (permissions.length === 0) return;

  const now = Date.now();

  await tx.insert(rolePermissions).values(
    permissions.map((permission) => ({
      roleId,
      permission,
      createdAt: now,
      updatedAt: now
    }))
  );
};

export { syncRolePermissions };
