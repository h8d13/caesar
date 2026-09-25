import { socialCreditLedger } from '@caesar/shared/db/schema';
import { CoinflipSide } from '@caesar/shared/games/coinflip';
import { tdb } from '@server/__tests__/setup';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { CoinflipRuntime } from '../coinflip/runtime';
import { createGameLedgerBindings } from '../shared-bindings';

const fund = (userId: number, amount: number) =>
  tdb.insert(socialCreditLedger).values({
    targetId: userId,
    voterId: null,
    ledgerableType: 'test',
    ledgerableId: null,
    amount,
    createdAt: Date.now()
  });

const balanceOf = async (userId: number) => {
  const row = await tdb
    .select({
      balance: sql<number>`COALESCE(SUM(${socialCreditLedger.amount}), 0)`
    })
    .from(socialCreditLedger)
    .where(eq(socialCreditLedger.targetId, userId))
    .get();

  return row?.balance ?? 0;
};

const fulfilled = (results: PromiseSettledResult<unknown>[]) =>
  results.filter((r) => r.status === 'fulfilled').length;

describe('coinflip concurrency', () => {
  test('parallel challenges cannot overdraw one balance', async () => {
    const runtime = new CoinflipRuntime(createGameLedgerBindings('coinflip'));
    await fund(3, 100);

    const results = await Promise.allSettled([
      runtime.createChallenge(3, CoinflipSide.HEADS, 100),
      runtime.createChallenge(3, CoinflipSide.TAILS, 100)
    ]);

    expect(fulfilled(results)).toBe(1);
    expect(await balanceOf(3)).toBe(0);
  });

  test('two acceptors: only one is debited', async () => {
    const runtime = new CoinflipRuntime(createGameLedgerBindings('coinflip'));
    await fund(1, 100);
    await fund(3, 100);
    await fund(4, 100);

    const challengeId = await runtime.createChallenge(
      1,
      CoinflipSide.HEADS,
      100
    );

    const results = await Promise.allSettled([
      runtime.acceptChallenge(challengeId, 3),
      runtime.acceptChallenge(challengeId, 4)
    ]);

    expect(fulfilled(results)).toBe(1);

    // the losing acceptor keeps their stake
    const balances = [await balanceOf(3), await balanceOf(4)].sort();
    expect(balances).toEqual([0, 100]);
  });
});
