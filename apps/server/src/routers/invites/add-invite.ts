import { ActivityLogType, getRandomString, Permission } from '@caesar/shared';
import { invites } from '@caesar/shared/db/schema';
import { config } from '@server/config';
import { db } from '@server/db';
import { isAtUserCap } from '@server/helpers/user-cap';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { assertCanAssignRole } from '@server/routers/users/assert-can-assign-role';
import { assertCanModifyOwnerRole } from '@server/routers/users/assert-can-modify-owner-role';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { z } from 'zod';

const addInviteRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.addInvite.maxRequests,
  windowMs: config.rateLimiters.addInvite.windowMs,
  logLabel: 'addInvite'
})
  .input(
    z.object({
      maxUses: z.number().min(0).max(100).optional().default(0),
      expiresAt: z.number().optional().nullable().default(null),
      roleId: z.number().optional()
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_INVITES);

    invariant(!(await isAtUserCap()), {
      code: 'PRECONDITION_FAILED',
      message: 'Instance has reached its user limit. Cannot create new invites.'
    });

    // An invite hands its role to whoever redeems it, so it is a role
    // assignment and gets the same guards as users.addRole.
    if (input.roleId) {
      await assertCanModifyOwnerRole(ctx.userId, input.roleId, 'assign');
      await assertCanAssignRole(ctx.userId, input.roleId);
    }

    const newCode = getRandomString(24);

    const invite = await db
      .insert(invites)
      .values({
        code: newCode,
        creatorId: ctx.user.id,
        roleId: input.roleId || null,
        maxUses: input.maxUses || null,
        uses: 0,
        expiresAt: input.expiresAt || null,
        createdAt: Date.now()
      })
      .returning()
      .get();

    enqueueActivityLog({
      type: ActivityLogType.CREATED_INVITE,
      userId: ctx.user.id,
      details: {
        code: invite.code,
        maxUses: invite.maxUses || 0,
        expiresAt: invite.expiresAt
      }
    });

    return invite;
  });

export { addInviteRoute };
