import { ActivityLogType, Permission } from '@caesar/shared';
import { eq } from 'drizzle-orm';
import z from 'zod';
import { db } from '@server/db';
import { publishUser } from '@server/db/publishers';
import { users } from '@server/db/schema';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { protectedProcedure } from '@server/utils/trpc';

const unbanRoute = protectedProcedure
  .input(
    z.object({
      userId: z.number()
    })
  )
  .mutation(async ({ ctx, input }) => {
    await ctx.needsPermission(Permission.MANAGE_USERS);

    await db
      .update(users)
      .set({
        banned: false,
        banReason: null,
        bannedAt: null
      })
      .where(eq(users.id, input.userId));

    publishUser(input.userId, 'update');

    enqueueActivityLog({
      type: ActivityLogType.USER_UNBANNED,
      userId: input.userId,
      details: {
        unbannedBy: ctx.userId
      }
    });
  });

export { unbanRoute };
