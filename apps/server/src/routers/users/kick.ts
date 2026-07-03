import { ActivityLogType, DisconnectCode, Permission } from '@caesar/shared';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import z from 'zod';
import { assertCanModifyOwnerUser } from './assert-can-modify-owner-user';

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

    const userWs = ctx.getUserWs(input.userId);

    invariant(userWs, {
      code: 'NOT_FOUND',
      message: 'User is not connected'
    });

    userWs.close(DisconnectCode.KICKED, input.reason);

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
