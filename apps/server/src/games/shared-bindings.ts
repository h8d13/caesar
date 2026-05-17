import { socialCreditLedger } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { publishUser } from '@server/db/publishers';
import { eq, sql } from 'drizzle-orm';

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
    const entry = db
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
    db.update(socialCreditLedger)
      .set({ amount: newAmount })
      .where(eq(socialCreditLedger.id, entryId))
      .run();
  },
  onUserBalanceChanged: async (userId: number) => {
    await publishUser(userId, 'update');
  },
  getBalance: async (userId: number) => {
    const result = db
      .select({
        balance: sql<number>`COALESCE(SUM(${socialCreditLedger.amount}), 0)`
      })
      .from(socialCreditLedger)
      .where(eq(socialCreditLedger.targetId, userId))
      .get();
    return result?.balance ?? 0;
  }
});

export { createGameLedgerBindings };
