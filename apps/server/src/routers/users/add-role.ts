import { Permission } from '@caesar/shared';
import { userRoles } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import {
  publishChannelPermissions,
  publishUser,
  publishUserChannelAccessDiff,
  snapshotUserChannelAccess
} from '@server/db/publishers';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { assertCanModifyOwnerRole } from './assert-can-modify-owner-role';

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

    await assertCanModifyOwnerRole(ctx.userId, input.roleId, 'assign');

    const beforeChannels = await snapshotUserChannelAccess(input.userId);

    await db.insert(userRoles).values({
      userId: input.userId,
      roleId: input.roleId,
      createdAt: Date.now()
    });

    const afterChannels = await snapshotUserChannelAccess(input.userId);

    // A role grant can newly expose channels the user couldn't see
    // before (channel ACL allows that role). Push the channel diff
    // and the refreshed per-channel permission map so the sidebar
    // updates without a hard refresh.
    await publishUserChannelAccessDiff(
      input.userId,
      beforeChannels,
      afterChannels
    );
    await publishChannelPermissions([input.userId]);

    publishUser(input.userId, 'update');
  });

export { addRoleRoute };
