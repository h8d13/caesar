import { pushSubscriptions } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { isFetchableUrl } from '@server/helpers/url-guard';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { isIP } from 'net';
import { z } from 'zod';

const MAX_SUBSCRIPTIONS_PER_USER = 10;

// upsert a Web Push subscription for the caller's current browser/device.
// endpoint is the push-service URL and uniquely identifies the device
// subscription; re-subscribing (or another user logging in on the same
// browser) takes the endpoint over. https only: anything else would let
// an authed user point message fan-out POSTs at internal hosts (SSRF).
// The server POSTs to this URL on every message the member is notified
// of, so it must name a public host: not an IP literal and not a name that
// only resolves inside the container network or on the host (compose
// service names are dotless). Real push services (FCM, Mozilla, Apple,
// WNS) are public DNS names on 443. A public name pointed at an internal
// address is not checked here: the TLS handshake fails, as no internal
// service holds a certificate for it.
const INTERNAL_SUFFIXES = ['.localhost', '.local', '.internal', '.lan'];

const isPublicPushEndpoint = (endpoint: string): boolean => {
  if (!isFetchableUrl(endpoint)) return false;

  const { hostname, port } = new URL(endpoint);
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (port && port !== '443') return false;
  if (isIP(host)) return false;
  if (!host.includes('.') || host.endsWith('.')) return false;

  return !INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
};

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
    invariant(isPublicPushEndpoint(input.endpoint), {
      code: 'BAD_REQUEST',
      message: 'Invalid push endpoint'
    });

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
    const rows = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, ctx.userId))
      .orderBy(desc(pushSubscriptions.createdAt), desc(pushSubscriptions.id));

    const stale = rows.slice(MAX_SUBSCRIPTIONS_PER_USER);

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
