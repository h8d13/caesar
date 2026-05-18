import { users } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const setAllowMultipleSessionsRoute = protectedProcedure
  .input(z.object({ value: z.boolean() }))
  .mutation(async ({ ctx, input }) => {
    await db
      .update(users)
      .set({ allowMultipleSessions: input.value })
      .where(eq(users.id, ctx.userId));

    return { allowMultipleSessions: input.value };
  });

export { setAllowMultipleSessionsRoute };
