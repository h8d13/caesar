import { Permission } from '@caesar/shared';
import { categories } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const getCategoryRoute = protectedProcedure
  .input(
    z.object({
      categoryId: z.number().min(1)
    })
  )
  .query(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_CATEGORIES);

    const category = await db
      .select()
      .from(categories)
      .where(eq(categories.id, input.categoryId))
      .limit(1)
      .get();

    invariant(category, {
      code: 'NOT_FOUND',
      message: 'Category not found'
    });

    return category;
  });

export { getCategoryRoute };
