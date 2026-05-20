import { socialCreditLedger } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { assertGamesEnabled } from '@server/games/shared-bindings';
import { protectedProcedure } from '@server/utils/trpc';
import { sql } from 'drizzle-orm';

const getBankBalanceRoute = protectedProcedure.query(async () => {
  await assertGamesEnabled();
  // Bank balance = negative sum of all game ledger entries
  // When players lose (negative entries), bank gains. When players win (positive entries), bank loses.
  const result = await db
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
