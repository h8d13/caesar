import { ActivityLogType, Permission } from '@caesar/shared';
import { channels } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { publishChannel } from '@server/db/publishers';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

const reorderChannelsRoute = protectedProcedure
  .input(
    z.object({
      categoryId: z.number(),
      channelIds: z.array(z.number().int()).max(500)
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_CHANNELS);

    // A DM moved into a category would be deleted with it; every other
    // channel admin route refuses DMs too.
    const dmChannel = await db
      .select({ id: channels.id })
      .from(channels)
      .where(
        and(inArray(channels.id, input.channelIds), eq(channels.isDm, true))
      )
      .get();

    invariant(!dmChannel, {
      code: 'FORBIDDEN',
      message: 'Direct message channels cannot be reordered'
    });

    await db.transaction(async (tx) => {
      for (let i = 0; i < input.channelIds.length; i++) {
        const channelId = input.channelIds[i]!;
        const newPosition = i + 1;

        // Writing categoryId every call lets the same route handle both
        // intra-category reorder and cross-category move. The client emits
        // a second reorder for the source category to close the gap.
        await tx
          .update(channels)
          .set({
            categoryId: input.categoryId,
            position: newPosition,
            updatedAt: Date.now()
          })
          .where(eq(channels.id, channelId));
      }
    });

    input.channelIds.forEach((channelId) => {
      void publishChannel(channelId, 'update');
    });

    if (input.channelIds.length > 0) {
      enqueueActivityLog({
        type: ActivityLogType.UPDATED_CHANNEL,
        userId: ctx.user.id,
        details: {
          channelId: input.channelIds[0]!,
          values: {
            position: input.channelIds.length
          }
        }
      });
    }
  });

export { reorderChannelsRoute };
