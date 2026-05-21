import { ActivityLogType, Permission } from '@caesar/shared';
import { roles } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { publishRole } from '@server/db/publishers';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { protectedProcedure } from '@server/utils/trpc';

const addRoleRoute = protectedProcedure.mutation(async ({ ctx }) => {
  await ctx.needsPermission(Permission.MANAGE_ROLES);

  const role = await db
    .insert(roles)
    .values({
      name: 'New Role',
      color: '#ffffff',
      isDefault: false,
      isPersistent: false,
      storageQuotaOverrideEnabled: false,
      storageSpaceQuota: 0,
      createdAt: Date.now()
    })
    .returning()
    .get();

  publishRole(role.id, 'create');
  enqueueActivityLog({
    type: ActivityLogType.CREATED_ROLE,
    userId: ctx.user.id,
    details: {
      roleId: role.id,
      roleName: role.name
    }
  });

  return role.id;
});

export { addRoleRoute };
