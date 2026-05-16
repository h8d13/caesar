import { ActivityLogType, Permission } from '@caesar/shared';
import { roles } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { fallbackUsersToDefaultRole } from '@server/db/mutations/users';
import { publishRole } from '@server/db/publishers';
import { getRole } from '@server/db/queries/roles';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const deleteRoleRoute = protectedProcedure
  .input(
    z.object({
      roleId: z.number()
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_ROLES);

    const role = await getRole(input.roleId);

    invariant(role, {
      code: 'NOT_FOUND',
      message: 'Role not found'
    });
    invariant(!role.isPersistent, {
      code: 'FORBIDDEN',
      message: 'Cannot delete a persistent role'
    });
    invariant(!role.isDefault, {
      code: 'FORBIDDEN',
      message: 'Cannot delete the default role'
    });

    await fallbackUsersToDefaultRole(role.id);
    await db.delete(roles).where(eq(roles.id, role.id));

    publishRole(role.id, 'delete');
    enqueueActivityLog({
      type: ActivityLogType.DELETED_ROLE,
      userId: ctx.user.id,
      details: {
        roleId: role.id,
        roleName: role.name
      }
    });
  });

export { deleteRoleRoute };
