import { ActivityLogType, OWNER_ROLE_ID, Permission } from '@caesar/shared';
import { roles } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { publishRole } from '@server/db/publishers';
import { getDefaultRole, getRole } from '@server/db/queries/roles';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { assertCanAssignRole } from '@server/routers/users/assert-can-assign-role';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const setDefaultRoleRoute = protectedProcedure
  .input(
    z.object({
      roleId: z.number().min(1)
    })
  )
  .mutation(async ({ ctx, input }) => {
    await ctx.needsPermission(Permission.MANAGE_ROLES);

    // The default role is handed to every signup and to every holder of a
    // deleted role, so making a role default assigns it. Owner can never be
    // one (not even by an owner), and nobody may make default a role they
    // could not assign by hand.
    invariant(input.roleId !== OWNER_ROLE_ID, {
      code: 'FORBIDDEN',
      message: 'The owner role cannot be the default role'
    });

    await assertCanAssignRole(ctx.userId, input.roleId);

    const defaultRole = await getDefaultRole();

    invariant(defaultRole, {
      code: 'NOT_FOUND',
      message: 'Default role not found'
    });

    if (input.roleId === defaultRole.id) return;

    const newDefaultRole = await getRole(input.roleId);

    invariant(newDefaultRole, {
      code: 'NOT_FOUND',
      message: 'Role not found'
    });

    await db.transaction(async (tx) => {
      await tx
        .update(roles)
        .set({ isDefault: false })
        .where(eq(roles.id, defaultRole.id));

      await tx
        .update(roles)
        .set({ isDefault: true })
        .where(eq(roles.id, input.roleId));
    });

    await Promise.all([
      publishRole(defaultRole.id, 'update'),
      publishRole(input.roleId, 'update')
    ]);

    enqueueActivityLog({
      type: ActivityLogType.UPDATED_DEFAULT_ROLE,
      userId: ctx.user.id,
      details: {
        newRoleId: input.roleId,
        oldRoleId: defaultRole.id,
        newRoleName: newDefaultRole.name,
        oldRoleName: defaultRole.name
      }
    });
  });

export { setDefaultRoleRoute };
