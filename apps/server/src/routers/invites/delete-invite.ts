import { ActivityLogType, Permission } from '@caesar/shared';
import { db } from '@server/db';
import { invites } from '@server/db/schema';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const deleteInviteRoute = protectedProcedure
  .input(
    z.object({
      inviteId: z.number()
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_INVITES);

    const removedInvite = await db
      .delete(invites)
      .where(eq(invites.id, input.inviteId))
      .returning()
      .get();

    invariant(removedInvite, {
      code: 'NOT_FOUND',
      message: 'Invite not found'
    });

    enqueueActivityLog({
      type: ActivityLogType.DELETED_INVITE,
      userId: ctx.user.id,
      details: {
        code: removedInvite.code
      }
    });
  });

export { deleteInviteRoute };
