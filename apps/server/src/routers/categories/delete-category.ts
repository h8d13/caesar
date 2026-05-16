import { ActivityLogType, Permission } from '@caesar/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@server/db';
import { publishCategory } from '@server/db/publishers';
import { categories, channels } from '@server/db/schema';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';

const deleteCategoryRoute = protectedProcedure
  .input(
    z.object({
      categoryId: z.number()
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_CATEGORIES);

    const removedCategory = await db
      .delete(categories)
      .where(eq(categories.id, input.categoryId))
      .returning()
      .get();

    invariant(removedCategory, 'Category not found');

    await db
      .delete(channels)
      .where(eq(channels.categoryId, removedCategory.id));

    publishCategory(removedCategory.id, 'delete');
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
