import { ActivityLogType, getRandomString, Permission } from '@caesar/shared';
import { db } from '@server/db';
import { invites, roles } from '@server/db/schema';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const addInviteRoute = protectedProcedure
  .input(
    z.object({
      maxUses: z.number().min(0).max(100).optional().default(0),
      expiresAt: z.number().optional().nullable().default(null),
      roleId: z.number().optional()
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_INVITES);

    if (input.roleId) {
      const role = await db
        .select()
        .from(roles)
        .where(eq(roles.id, input.roleId))
        .get();

      invariant(role, {
        code: 'NOT_FOUND',
        message: 'Role not found'
      });
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
