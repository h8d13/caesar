import { ActivityLogType, DisconnectCode, Permission } from '@caesar/shared';
import { pushSubscriptions, users } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { publishUser } from '@server/db/publishers';
import { assertCanModifyOwnerUser } from '@server/helpers/assert-can-modify-owner-user';
import { closeSocket } from '@server/helpers/close-reason';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import z from 'zod';

const banRoute = protectedProcedure
  .input(
    z.object({
      userId: z.number(),
      reason: z.string().optional()
    })
  )
  .mutation(async ({ ctx, input }) => {
    await ctx.needsPermission(Permission.MANAGE_USERS);

    invariant(input.userId !== ctx.user.id, {
      code: 'BAD_REQUEST',
      message: 'You cannot ban yourself.'
    });

    await assertCanModifyOwnerUser(ctx.userId, input.userId, 'ban');

    await db
      .update(users)
      .set({
        banned: true,
        banReason: input.reason ?? null,
        bannedAt: Date.now()
      })
      .where(eq(users.id, input.userId));

    // After the write: closed first, a client reconnecting at once would
    // still pass the session gate and stay joined on a banned account.
    for (const userWs of ctx.getUserWsList(input.userId)) {
      closeSocket(userWs, DisconnectCode.BANNED, input.reason);
    }

    // a banned user can no longer unsubscribe, and the fan-out would keep
    // pushing "<sender> in #<channel>" to their devices
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, input.userId));

    void publishUser(input.userId, 'update');

    enqueueActivityLog({
      type: ActivityLogType.USER_BANNED,
      userId: input.userId,
      details: {
        reason: input.reason,
        bannedBy: ctx.userId
      }
    });
  });

export { banRoute };
