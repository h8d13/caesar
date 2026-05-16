import { ActivityLogType, Permission } from '@caesar/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@server/db';
import { publishCategory } from '@server/db/publishers';
import { categories } from '@server/db/schema';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { protectedProcedure } from '@server/utils/trpc';

const addCategoryRoute = protectedProcedure
  .input(
    z.object({
      name: z.string().min(1).max(32)
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_CATEGORIES);

    const [result] = await db
      .select({ maxPos: sql<number>`COALESCE(MAX(${categories.position}), 0)` })
      .from(categories);

    const targetPosition = (result?.maxPos ?? 0) + 1;

    const created = await db
      .insert(categories)
      .values({
        name: input.name,
        position: targetPosition,
        createdAt: Date.now()
      })
      .returning()
      .get();

    publishCategory(created.id, 'create');
    enqueueActivityLog({
      type: ActivityLogType.CREATED_CATEGORY,
      userId: ctx.user.id,
      details: {
        categoryName: input.name,
        categoryId: created.id
      }
    });

    return created.id;
  });

export { addCategoryRoute };
