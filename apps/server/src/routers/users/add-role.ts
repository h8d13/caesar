import { OWNER_ROLE_ID, Permission } from '@caesar/shared';
import { userRoles } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { publishUser } from '@server/db/publishers';
import { getUserRoleIds } from '@server/db/queries/roles';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

const addRoleRoute = protectedProcedure
  .input(
    z.object({
      userId: z.number(),
      roleId: z.number()
    })
  )
  .mutation(async ({ ctx, input }) => {
    await ctx.needsPermission(Permission.MANAGE_USERS);
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

    invariant(existing.length === 0, {
      code: 'CONFLICT',
      message: 'User already has this role'
    });

    const assingingUserRoles = await getUserRoleIds(ctx.userId);
    const hasOwnerRole = assingingUserRoles.includes(OWNER_ROLE_ID);

    if (!hasOwnerRole && input.roleId === OWNER_ROLE_ID) {
      invariant(false, {
        code: 'FORBIDDEN',
        message: 'Only users with the owner role can assign the owner role'
      });
    }

    await db.insert(userRoles).values({
      userId: input.userId,
      roleId: input.roleId,
      createdAt: Date.now()
    });

    publishUser(input.userId, 'update');
  });

export { addRoleRoute };
