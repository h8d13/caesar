import { Permission } from '@caesar/shared';
import { userRoles } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { publishUser } from '@server/db/publishers';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { assertCanModifyOwnerRole } from './assert-can-modify-owner-role';

const removeRoleRoute = protectedProcedure
  .input(
    z.object({
      userId: z.number(),
      roleId: z.number()
    })
  )
  .mutation(async ({ ctx, input }) => {
    await ctx.needsPermission(Permission.MANAGE_USERS);

    await assertCanModifyOwnerRole(ctx.userId, input.roleId, 'remove');

    const existing = await db
      .select()
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, input.userId),
          eq(userRoles.roleId, input.roleId)
        )
      )
      .limit(1);

    invariant(existing.length > 0, {
      code: 'NOT_FOUND',
      message: 'User does not have this role'
    });

    await db
      .delete(userRoles)
      .where(
        and(
          eq(userRoles.userId, input.userId),
          eq(userRoles.roleId, input.roleId)
        )
      );

    publishUser(input.userId, 'update');
  });

export { removeRoleRoute };
