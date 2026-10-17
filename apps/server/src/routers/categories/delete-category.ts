import { ActivityLogType, Permission } from '@caesar/shared';
import { categories, channels } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { publishCategory, publishChannel } from '@server/db/publishers';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { VoiceRuntime } from '@server/runtimes/voice';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const deleteCategoryRoute = protectedProcedure
  .input(
    z.object({
      categoryId: z.number()
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_CATEGORIES);

    // read before deleting: the category FK cascades to its channels
    const categoryChannels = await db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.categoryId, input.categoryId));

    const removedCategory = await db
      .delete(categories)
      .where(eq(categories.id, input.categoryId))
      .returning()
      .get();

    invariant(removedCategory, 'Category not found');

    await db
      .delete(channels)
      .where(eq(channels.categoryId, removedCategory.id));

    // same teardown as delete-channel: voice categories hold live runtimes,
    // and clients must drop (and leave) each channel, not just the category
    for (const { id } of categoryChannels) {
      VoiceRuntime.findById(id)?.destroy();
      void publishChannel(id, 'delete');
    }

    void publishCategory(removedCategory.id, 'delete');
    enqueueActivityLog({
      type: ActivityLogType.DELETED_CATEGORY,
      userId: ctx.user.id,
      details: {
        categoryId: removedCategory.id,
        categoryName: removedCategory.name
      }
    });
  });

export { deleteCategoryRoute };
