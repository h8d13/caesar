import { predictionPools, socialCreditLedger } from '@caesar/shared/db/schema';
import { initTest } from '@server/__tests__/helpers';
import { tdb } from '@server/__tests__/setup';
import { eq, sum } from 'drizzle-orm';
import { describe, expect, test } from 'vite-plus/test';

const fund = (userIds: number[]) =>
  tdb.insert(socialCreditLedger).values(
    userIds.map((targetId) => ({
      targetId,
      voterId: null,
      ledgerableType: 'passive',
      ledgerableId: null,
      amount: 100,
      createdAt: Date.now()
    }))
  );

describe('prediction router', () => {
  test('pool totals, backers and own stakes', async () => {
    await fund([1, 2, 3]);

    const { caller: owner } = await initTest(1);
    const { caller: user2 } = await initTest(2);
    const { caller: user3 } = await initTest(3);

    const created = await owner.prediction.create({
      question: 'will it ship?',
      options: ['yes', 'no'],
      durationMinutes: 60
    });
    const [yes, no] = created.pool!.options;

    await user2.prediction.stake({ optionId: yes!.id, amount: 10 });
    await user2.prediction.stake({ optionId: yes!.id, amount: 5 });
    await user3.prediction.stake({ optionId: yes!.id, amount: 7 });

    const state = await owner.prediction.stake({ optionId: no!.id, amount: 3 });

    expect(state.pool!.totalPot).toBe(25);
    expect(state.pool!.options).toEqual([
      { id: yes!.id, label: 'yes', total: 22, backers: 2 },
      { id: no!.id, label: 'no', total: 3, backers: 1 }
    ]);
    expect(state.yourStakes).toEqual([{ optionId: no!.id, amount: 3 }]);

    const { yourStakes } = await user2.prediction.getState();

    expect(yourStakes).toEqual([{ optionId: yes!.id, amount: 15 }]);
  });

  test('a pool without bets reports zero totals', async () => {
    const { caller } = await initTest(1);

    const { pool } = await caller.prediction.create({
      question: 'anyone?',
      options: ['a', 'b'],
      durationMinutes: 5
    });

    expect(pool!.totalPot).toBe(0);
    expect(pool!.options.map((o) => [o.total, o.backers])).toEqual([
      [0, 0],
      [0, 0]
    ]);
  });

  test('two concurrent resolves settle the pool once', async () => {
    await fund([1, 2]);

    const { caller: owner } = await initTest(1);
    const { caller: member } = await initTest(2);

    const created = await owner.prediction.create({
      question: 'race?',
      options: ['a', 'b'],
      durationMinutes: 5
    });
    const [a, b] = created.pool!.options;

    await owner.prediction.stake({ optionId: a!.id, amount: 50 });
    await member.prediction.stake({ optionId: b!.id, amount: 50 });

    await tdb
      .update(predictionPools)
      .set({ closesAt: Date.now() - 1000 })
      .where(eq(predictionPools.id, created.pool!.id));

    const results = await Promise.allSettled([
      owner.prediction.resolve({ winningOptionId: a!.id }),
      owner.prediction.resolve({ winningOptionId: b!.id })
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    // zero-sum: both sides were paid the whole pot when the two interleaved
    const ledger = await tdb
      .select({ total: sum(socialCreditLedger.amount) })
      .from(socialCreditLedger)
      .get();

    expect(Number(ledger?.total)).toBe(200);
  });

  test('two concurrent creates open one pool', async () => {
    const { caller } = await initTest(1);
    const input = { question: 'q', options: ['a', 'b'], durationMinutes: 5 };

    const results = await Promise.allSettled([
      caller.prediction.create(input),
      caller.prediction.create(input)
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    // a second open pool could never be resolved and blocked every later one
    const open = await tdb
      .select()
      .from(predictionPools)
      .where(eq(predictionPools.status, 'open'));

    expect(open).toHaveLength(1);
  });

  test('a stake racing a cancel is refunded or refused, never kept', async () => {
    await fund([1, 2]);

    const { caller: owner } = await initTest(1);
    const { caller: member } = await initTest(2);

    const created = await owner.prediction.create({
      question: 'cancelled?',
      options: ['a', 'b'],
      durationMinutes: 5
    });
    const [a] = created.pool!.options;

    await Promise.allSettled([
      member.prediction.stake({ optionId: a!.id, amount: 40 }),
      owner.prediction.cancel()
    ]);

    // whichever ran first, nothing of the 200 may be stuck in a void pool
    const ledger = await tdb
      .select({ total: sum(socialCreditLedger.amount) })
      .from(socialCreditLedger)
      .get();

    expect(Number(ledger?.total)).toBe(200);
  });
});
