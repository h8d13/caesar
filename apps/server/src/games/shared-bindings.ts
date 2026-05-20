import { socialCreditLedger } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { publishUser } from '@server/db/publishers';
import { getSettings } from '@server/db/queries/server';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure, t } from '@server/utils/trpc';
import { eq, sql } from 'drizzle-orm';

const assertGamesEnabled = async (): Promise<void> => {
  const settings = await getSettings();
  invariant(settings.gamesEnabled, {
    code: 'FORBIDDEN',
    message: 'Games are disabled on this server'
  });
};

// Games-gated equivalent of protectedProcedure. Used by every game
// router so flipping settings.gamesEnabled off blocks every entry
// point (queries, mutations, subscriptions) in one swap. Standalone
// `assertGamesEnabled()` stays exported for non-game routes that touch
// game data (bank balance, game history).
const gamesProcedure = protectedProcedure.use(
  t.middleware(async ({ next }) => {
    await assertGamesEnabled();
    return next();
  })
);

// The 4 social-credit-ledger touchpoints every game runtime needs:
// debit/credit a bet, amend it on a settle, broadcast the resulting
// balance, look up the current balance. Differs across games only in
// the ledgerableType tag (so we can attribute entries back to the game
// that created them); the rest is identical and lives here.
const createGameLedgerBindings = (ledgerableType: string) => ({
  createLedgerEntry: async (
    userId: number,
    amount: number,
    ledgerableId: number
  ) => {
    const entry = await db
      .insert(socialCreditLedger)
      .values({
        targetId: userId,
        ledgerableType,
        ledgerableId,
        amount,
        createdAt: Date.now()
      })
      .returning({ id: socialCreditLedger.id })
      .get();
    return entry.id;
  },
  updateLedgerEntry: async (entryId: number, newAmount: number) => {
    await db
      .update(socialCreditLedger)
      .set({ amount: newAmount })
      .where(eq(socialCreditLedger.id, entryId))
      .run();
  },
  onUserBalanceChanged: async (userId: number) => {
    await publishUser(userId, 'update');
  },
  getBalance: async (userId: number) => {
    const result = await db
      .select({
        balance: sql<number>`COALESCE(SUM(${socialCreditLedger.amount}), 0)`
      })
      .from(socialCreditLedger)
      .where(eq(socialCreditLedger.targetId, userId))
      .get();
    return result?.balance ?? 0;
  }
});

export { assertGamesEnabled, createGameLedgerBindings, gamesProcedure };
