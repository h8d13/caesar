import { ActivityLogType, Permission } from '@caesar/shared';
import { db } from '@server/db';
import { publishCategory } from '@server/db/publishers';
import { categories } from '@server/db/schema';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateCategoryRoute = protectedProcedure
  .input(
    z.object({
      categoryId: z.number().min(1),
      name: z.string().min(1).max(32)
    })
  )
  .mutation(async ({ ctx, input }) => {
    await ctx.needsPermission(Permission.MANAGE_CATEGORIES);

    const existingCategory = await db
      .select()
      .from(categories)
      .where(eq(categories.id, input.categoryId))
      .limit(1)
      .get();

    invariant(existingCategory, {
      code: 'NOT_FOUND',
      message: 'Category not found.'
    });

    await db
      .update(categories)
      .set({
        name: input.name,
        updatedAt: Date.now()
      })
      .where(eq(categories.id, input.categoryId));

    publishCategory(input.categoryId, 'update');
    enqueueActivityLog({
      type: ActivityLogType.UPDATED_CATEGORY,
      userId: ctx.user.id,
      details: {
        categoryId: input.categoryId,
        values: {
          name: input.name
        }
      }
    });
  });

export { updateCategoryRoute };
