import { ActivityLogType, OWNER_ROLE_ID, Permission } from '@caesar/shared';
import { roles } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { syncRolePermissions } from '@server/db/mutations/roles';
import { publishRole } from '@server/db/publishers';
import { getRole } from '@server/db/queries/roles';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { assertCanGrantPermissions } from '@server/routers/users/assert-can-assign-role';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { z } from 'zod';

// matches the name cap in roles.update
const MAX_ROLE_NAME = 26;

// Copies a role as a starting point (typically the default role). The copy
// is a plain role: never default, never persistent.
const duplicateRoleRoute = protectedProcedure
  .input(
    z.object({
      roleId: z.number().min(1)
    })
  )
  .mutation(async ({ ctx, input }) => {
    await ctx.needsPermission(Permission.MANAGE_ROLES);

    // a copy of Owner would be an all-permissions role under another name
    invariant(input.roleId !== OWNER_ROLE_ID, {
      code: 'FORBIDDEN',
      message: 'The owner role cannot be duplicated'
    });

    const source = await getRole(input.roleId);

    invariant(source, { code: 'NOT_FOUND', message: 'Role not found' });

    // the copy hands out every permission of the source
    await assertCanGrantPermissions(ctx.userId, source.permissions);

    const role = await db.transaction(async (tx) => {
      const copy = await tx
        .insert(roles)
        .values({
          name: `${source.name} copy`.slice(0, MAX_ROLE_NAME),
          color: source.color,
          isDefault: false,
          isPersistent: false,
          storageQuotaOverrideEnabled: source.storageQuotaOverrideEnabled,
          storageSpaceQuota: source.storageSpaceQuota,
          createdAt: Date.now()
        })
        .returning()
        .get();

      await syncRolePermissions(tx, copy.id, source.permissions);

      return copy;
    });

    void publishRole(role.id, 'create');
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

export { duplicateRoleRoute };
