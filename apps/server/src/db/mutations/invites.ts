import type { TInvite } from '@caesar/shared';
import { invites } from '@caesar/shared/db/schema';
import { and, eq, gte, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '..';

// Validate and spend one use in a single statement. A read-then-increment
// lets parallel signups all pass the check and push uses past maxUses.
// maxUses / expiresAt of null or 0 mean unlimited / never.
const consumeInvite = async (
  code: string | undefined
): Promise<TInvite | undefined> => {
  if (!code) return undefined;

  return db
    .update(invites)
    .set({ uses: sql`${invites.uses} + 1` })
    .where(
      and(
        eq(invites.code, code),
        or(
          isNull(invites.maxUses),
          eq(invites.maxUses, 0),
          lt(invites.uses, invites.maxUses)
        ),
        or(
          isNull(invites.expiresAt),
          eq(invites.expiresAt, 0),
          gte(invites.expiresAt, Date.now())
        )
      )
    )
    .returning()
    .get();
};

// Give back a use spent on a signup that failed after consumeInvite.
const refundInvite = async (code: string) =>
  db
    .update(invites)
    .set({ uses: sql`${invites.uses} - 1` })
    .where(eq(invites.code, code));

export { consumeInvite, refundInvite };
