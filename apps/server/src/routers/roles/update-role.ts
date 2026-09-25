import {
  ActivityLogType,
  OWNER_ROLE_ID,
  Permission,
  STORAGE_MAX_QUOTA_PER_USER,
  STORAGE_MIN_QUOTA_PER_USER
} from '@caesar/shared';
import { roles } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { syncRolePermissions } from '@server/db/mutations/roles';
import { publishRole } from '@server/db/publishers';
import { getRole } from '@server/db/queries/roles';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { assertCanGrantPermissions } from '@server/routers/users/assert-can-assign-role';
import { assertCanModifyOwnerRole } from '@server/routers/users/assert-can-modify-owner-role';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateRoleRoute = protectedProcedure
  .input(
    z.object({
      roleId: z.number().min(1),
      name: z.string().min(1).max(26),
      color: z
        .string()
        .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color'),
      permissions: z.enum(Permission).array(),
      storageQuotaOverrideEnabled: z.boolean(),
      storageSpaceQuota: z
        .number()
        .min(STORAGE_MIN_QUOTA_PER_USER)
        .max(STORAGE_MAX_QUOTA_PER_USER)
    })
  )
  .mutation(async ({ ctx, input }) => {
    await ctx.needsPermission(Permission.MANAGE_ROLES);
    await assertCanModifyOwnerRole(ctx.userId, input.roleId, 'edit');

    const currentRole = await getRole(input.roleId);

    invariant(currentRole, { code: 'NOT_FOUND', message: 'Role not found' });

    // Only newly added permissions count as a grant: an actor may still
    // strip permissions it doesn't hold from a role (demoting is safe).
    const addedPermissions = input.permissions.filter(
      (permission) => !currentRole.permissions.includes(permission)
    );

    await assertCanGrantPermissions(ctx.userId, addedPermissions);

    const updatedRole = await db
      .update(roles)
      .set({
        name: input.name,
        color: input.color,
        storageQuotaOverrideEnabled: input.storageQuotaOverrideEnabled,
        storageSpaceQuota: input.storageSpaceQuota
      })
      .where(eq(roles.id, input.roleId))
      .returning()
      .get();

    if (updatedRole.id !== OWNER_ROLE_ID) {
      await syncRolePermissions(updatedRole.id, input.permissions);
    }

    void publishRole(updatedRole.id, 'update');
    enqueueActivityLog({
      type: ActivityLogType.UPDATED_ROLE,
      userId: ctx.user.id,
      details: {
        roleId: updatedRole.id,
        permissions: input.permissions,
        values: input
      }
    });
  });

export { updateRoleRoute };
