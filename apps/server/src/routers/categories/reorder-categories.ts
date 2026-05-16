import { ActivityLogType, Permission } from '@caesar/shared';
import { db } from '@server/db';
import { publishCategory } from '@server/db/publishers';
import { categories } from '@server/db/schema';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const reorderCategoriesRoute = protectedProcedure
  .input(
    z.object({
      categoryIds: z.array(z.number())
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_CATEGORIES);

    await db.transaction(async (tx) => {
      for (let i = 0; i < input.categoryIds.length; i++) {
        const categoryId = input.categoryIds[i]!;
        const newPosition = i + 1;

        await tx
          .update(categories)
          .set({
            position: newPosition,
            updatedAt: Date.now()
          })
          .where(eq(categories.id, categoryId));
      }
    });

    input.categoryIds.forEach((categoryId) => {
      publishCategory(categoryId, 'update');
    });

    if (input.categoryIds.length > 0) {
      enqueueActivityLog({
        type: ActivityLogType.UPDATED_CATEGORY,
        userId: ctx.user.id,
        details: {
          categoryId: input.categoryIds[0]!,
          values: {
            position: input.categoryIds.length
          }
        }
      });
    }
  });

export { reorderCategoriesRoute };
