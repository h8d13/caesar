import { ActivityLogType, DisconnectCode, Permission } from '@caesar/shared';
import { assertCanModifyOwnerUser } from '@server/helpers/assert-can-modify-owner-user';
import { toCloseReason } from '@server/helpers/close-reason';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import z from 'zod';

const kickRoute = protectedProcedure
  .input(
    z.object({
      userId: z.number(),
      reason: z.string().optional()
    })
  )
  .mutation(async ({ ctx, input }) => {
    await ctx.needsPermission(Permission.MANAGE_USERS);

    await assertCanModifyOwnerUser(ctx.userId, input.userId, 'kick');

    const userWsList = ctx.getUserWsList(input.userId);

    invariant(userWsList.length > 0, {
      code: 'NOT_FOUND',
      message: 'User is not connected'
    });

    for (const userWs of userWsList) {
      userWs.close(DisconnectCode.KICKED, toCloseReason(input.reason));
    }

    enqueueActivityLog({
      type: ActivityLogType.USER_KICKED,
      userId: input.userId,
      details: {
        reason: input.reason,
        kickedBy: ctx.userId
      }
    });
  });

export { kickRoute };
