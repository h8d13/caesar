import { pushSubscriptions } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { protectedProcedure } from '@server/utils/trpc';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

// drop the caller's subscription for this device. scoped to the caller so
// one user cannot unsubscribe another user's endpoint.
const unsubscribeRoute = protectedProcedure
  .input(z.object({ endpoint: z.string().url().max(2048) }))
  .mutation(async ({ ctx, input }) => {
    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, input.endpoint),
          eq(pushSubscriptions.userId, ctx.userId)
        )
      );
  });

export { unsubscribeRoute };
