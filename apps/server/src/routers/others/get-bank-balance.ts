import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { socialCreditLedger } from '../../db/schema';
import { protectedProcedure } from '../../utils/trpc';

const getBankBalanceRoute = protectedProcedure.query(() => {
  // Bank balance = negative sum of all game ledger entries
  // When players lose (negative entries), bank gains. When players win (positive entries), bank loses.
  const result = db
    .select({
      balance: sql<number>`COALESCE(-SUM(${socialCreditLedger.amount}), 0)`
    })
    .from(socialCreditLedger)
    .where(sql`${socialCreditLedger.ledgerableType} IN ('crash', 'roulette')`)
    .get();

  return { balance: result?.balance ?? 0 };
});

export { getBankBalanceRoute };
