import { db } from '@server/db';
import { publishUser } from '@server/db/publishers';
import { socialCreditLedger } from '@server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { setRuntime } from './router';
import { CrashRuntime } from './runtime';

const initCrash = async () => {
  const runtime = new CrashRuntime({
    createLedgerEntry: async (userId, amount, roundId) => {
      const entry = db
        .insert(socialCreditLedger)
        .values({
          targetId: userId,
          ledgerableType: 'crash',
          ledgerableId: roundId,
          amount,
          createdAt: Date.now()
        })
        .returning({ id: socialCreditLedger.id })
        .get();
      return entry.id;
    },
    updateLedgerEntry: async (entryId, newAmount) => {
      db.update(socialCreditLedger)
        .set({ amount: newAmount })
        .where(eq(socialCreditLedger.id, entryId))
        .run();
    },
    onUserBalanceChanged: async (userId) => {
      await publishUser(userId, 'update');
    },
    getBalance: async (userId) => {
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

  setRuntime(runtime);
  await runtime.start();
};

export { initCrash };
