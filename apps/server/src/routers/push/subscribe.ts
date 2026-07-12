import { pushSubscriptions } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { protectedProcedure } from '@server/utils/trpc';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

const MAX_SUBSCRIPTIONS_PER_USER = 10;

// upsert a Web Push subscription for the caller's current browser/device.
// endpoint is the push-service URL and uniquely identifies the device
// subscription; re-subscribing (or another user logging in on the same
// browser) takes the endpoint over. https only: anything else would let
// an authed user point message fan-out POSTs at internal hosts (SSRF).
const subscribeRoute = protectedProcedure
  .input(
    z.object({
      endpoint: z.string().url().startsWith('https://').max(2048),
      p256dh: z.string().min(1).max(256),
      auth: z.string().min(1).max(256),
      notifyAll: z.boolean(),
      notifyMentions: z.boolean(),
      notifyDms: z.boolean()
    })
  )
  .mutation(async ({ ctx, input }) => {
    await db
      .insert(pushSubscriptions)
      .values({
        userId: ctx.userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        notifyAll: input.notifyAll,
        notifyMentions: input.notifyMentions,
        notifyDms: input.notifyDms,
        createdAt: Date.now()
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: ctx.userId,
          p256dh: input.p256dh,
          auth: input.auth,
          notifyAll: input.notifyAll,
          notifyMentions: input.notifyMentions,
          notifyDms: input.notifyDms
        }
      });

    // per-user cap so one account can't turn every message into an
    // unbounded outbound POST storm. Endpoints rotate, so evict oldest
    // instead of rejecting: a rejected rotation would brick the device.
    const stale = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, ctx.userId))
      .orderBy(desc(pushSubscriptions.createdAt), desc(pushSubscriptions.id))
      .offset(MAX_SUBSCRIPTIONS_PER_USER);

    if (stale.length > 0) {
      await db.delete(pushSubscriptions).where(
        and(
          eq(pushSubscriptions.userId, ctx.userId),
          inArray(
            pushSubscriptions.id,
            stale.map((row) => row.id)
          )
        )
      );
    }
  });

export { subscribeRoute };
