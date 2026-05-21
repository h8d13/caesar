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
import { enqueueActivityLog } from '@server/queues/activity-log';
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

    publishRole(updatedRole.id, 'update');
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
