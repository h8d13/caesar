import { sql } from 'drizzle-orm';
import { db } from '@server/db';
import { socialCreditLedger } from '@server/db/schema';
import { protectedProcedure } from '@server/utils/trpc';

const getBankBalanceRoute = protectedProcedure.query(() => {
  // Bank balance = negative sum of all game ledger entries
  // When players lose (negative entries), bank gains. When players win (positive entries), bank loses.
  const result = db
    .select({
      balance: sql<number>`COALESCE(-SUM(${socialCreditLedger.amount}), 0)`
    })
    .from(socialCreditLedger)
    .where(
      sql`${socialCreditLedger.ledgerableType} IN ('crash', 'roulette', 'coinflip')`
    )
    .get();

  return { balance: result?.balance ?? 0 };
});

export { getBankBalanceRoute };
