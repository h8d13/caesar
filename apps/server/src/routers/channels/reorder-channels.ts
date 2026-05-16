import { ActivityLogType, Permission } from '@caesar/shared';
import { channels } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { publishChannel } from '@server/db/publishers';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const reorderChannelsRoute = protectedProcedure
  .input(
    z.object({
      categoryId: z.number(),
      channelIds: z.array(z.number())
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_CHANNELS);

    await db.transaction(async (tx) => {
      for (let i = 0; i < input.channelIds.length; i++) {
        const channelId = input.channelIds[i]!;
        const newPosition = i + 1;

        await tx
          .update(channels)
          .set({
            position: newPosition,
            updatedAt: Date.now()
          })
          .where(eq(channels.id, channelId));
      }
    });

    input.channelIds.forEach((channelId) => {
      publishChannel(channelId, 'update');
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
