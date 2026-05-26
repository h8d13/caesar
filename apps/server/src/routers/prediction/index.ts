import { ServerEvents } from '@caesar/shared';
import {
  predictionBets,
  predictionOptions,
  predictionPools,
  socialCreditLedger
} from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { publishUser } from '@server/db/publishers';
import { pubsub } from '@server/utils/pubsub';
import {
  protectedProcedure,
  rateLimitedProcedure,
  t
} from '@server/utils/trpc';
import { and, desc, eq, sql } from 'drizzle-orm';
import z from 'zod';

const LEDGER_TYPE = 'prediction_pool';

// Optional "challenge window" (the time the predicted event has to play out,
// after betting closes). Pure display/timing: it holds no SC and gates no
// resolution (which only needs closesAt), so it lives in memory — a restart
// just drops the countdown and the pool falls back to "awaiting result".
const challengeEndsAtById = new Map<number, number>();

type TPoolRow = typeof predictionPools.$inferSelect;
type TPoolStatus = 'open' | 'resolved' | 'void';

type TPublicPool = {
  id: number;
  creatorId: number;
  question: string;
  status: TPoolStatus;
  closesAt: number;
  challengeEndsAt: number | null;
  winningOptionId: number | null;
  createdAt: number;
  totalPot: number;
  options: { id: number; label: string; total: number; backers: number }[];
};

const getBalance = async (userId: number): Promise<number> => {
  const row = await db
    .select({
      balance: sql<number>`COALESCE(SUM(${socialCreditLedger.amount}), 0)`
    })
    .from(socialCreditLedger)
    .where(eq(socialCreditLedger.targetId, userId))
    .get();

  return row?.balance ?? 0;
};

const createLedgerEntry = async (
  userId: number,
  amount: number,
  poolId: number
): Promise<number> => {
  const entry = await db
    .insert(socialCreditLedger)
    .values({
      targetId: userId,
      ledgerableType: LEDGER_TYPE,
      ledgerableId: poolId,
      amount,
      createdAt: Date.now()
    })
    .returning({ id: socialCreditLedger.id })
    .get();

  return entry.id;
};

const updateLedgerEntry = async (
  entryId: number,
  amount: number
): Promise<void> => {
  await db
    .update(socialCreditLedger)
    .set({ amount })
    .where(eq(socialCreditLedger.id, entryId))
    .run();
};

// The current pool is simply the most recent one (open, resolved or void). A
// new pool can only be created once the previous one is no longer open.
const getCurrentPool = () =>
  db
    .select()
    .from(predictionPools)
    .orderBy(desc(predictionPools.id))
    .limit(1)
    .get();

const buildPublic = async (pool: TPoolRow): Promise<TPublicPool> => {
  const options = await db
    .select()
    .from(predictionOptions)
    .where(eq(predictionOptions.poolId, pool.id))
    .all();
  const bets = await db
    .select()
    .from(predictionBets)
    .where(eq(predictionBets.poolId, pool.id))
    .all();

  return {
    id: pool.id,
    creatorId: pool.creatorId,
    question: pool.question,
    status: pool.status as TPoolStatus,
    closesAt: pool.closesAt,
    challengeEndsAt: challengeEndsAtById.get(pool.id) ?? null,
    winningOptionId: pool.winningOptionId,
    createdAt: pool.createdAt,
    totalPot: bets.reduce((sum, b) => sum + b.amount, 0),
    options: options.map((o) => {
      const onOption = bets.filter((b) => b.optionId === o.id);
      return {
        id: o.id,
        label: o.label,
        total: onOption.reduce((sum, b) => sum + b.amount, 0),
        backers: new Set(onOption.map((b) => b.userId)).size
      };
    })
  };
};

type TYourStake = { optionId: number; amount: number };

const stateFor = async (userId: number) => {
  const pool = await getCurrentPool();
  if (!pool) {
    return { pool: null, yourStakes: [] as TYourStake[] };
  }

  const publicPool = await buildPublic(pool);
  const myBets = await db
    .select()
    .from(predictionBets)
    .where(
      and(eq(predictionBets.poolId, pool.id), eq(predictionBets.userId, userId))
    )
    .all();

  const byOption = new Map<number, number>();
  for (const b of myBets) {
    byOption.set(b.optionId, (byOption.get(b.optionId) ?? 0) + b.amount);
  }

  return {
    pool: publicPool,
    yourStakes: [...byOption].map(([optionId, amount]) => ({
      optionId,
      amount
    }))
  };
};

// Server-wide pool, so broadcast the freshly-built public state to everyone.
const broadcast = async () => {
  const pool = await getCurrentPool();
  pubsub.publish(ServerEvents.PREDICTION_POOL_UPDATE, {
    pool: pool ? await buildPublic(pool) : null
  });
};

const getStateRoute = protectedProcedure.query(({ ctx }) =>
  stateFor(ctx.userId)
);

const createPoolRoute = protectedProcedure
  .input(
    z.object({
      question: z.string().trim().min(1).max(200),
      options: z.array(z.string().trim().min(1).max(80)).min(2).max(6),
      durationMinutes: z.number().int().min(1).max(720),
      challengeMinutes: z.number().int().min(1).max(720).optional()
    })
  )
  .mutation(async ({ ctx, input }) => {
    const open = await db
      .select({ id: predictionPools.id })
      .from(predictionPools)
      .where(eq(predictionPools.status, 'open'))
      .get();
    if (open) {
      ctx.throwValidationError('pool', 'A pool is already running');
    }

    const closesAt = Date.now() + input.durationMinutes * 60_000;
    const pool = await db
      .insert(predictionPools)
      .values({
        creatorId: ctx.userId,
        question: input.question,
        status: 'open',
        closesAt,
        createdAt: Date.now()
      })
      .returning({ id: predictionPools.id })
      .get();

    for (const label of input.options) {
      await db
        .insert(predictionOptions)
        .values({ poolId: pool.id, label })
        .run();
    }

    // Optional challenge window starts when betting closes. In memory only.
    if (input.challengeMinutes) {
      challengeEndsAtById.set(
        pool.id,
        closesAt + input.challengeMinutes * 60_000
      );
    }

    await broadcast();
    return stateFor(ctx.userId);
  });

const stakeRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: 20,
  windowMs: 10_000,
  logLabel: 'prediction.stake'
})
  .input(
    z.object({
      optionId: z.number().int(),
      amount: z.number().int().min(1).max(1_000_000)
    })
  )
  .mutation(async ({ ctx, input }) => {
    const pool = await getCurrentPool();
    if (!pool || pool.status !== 'open') {
      ctx.throwValidationError('pool', 'No open pool');
    }
    const p = pool!;

    if (Date.now() >= p.closesAt) {
      ctx.throwValidationError('pool', 'Betting has closed');
    }

    const option = await db
      .select({ id: predictionOptions.id })
      .from(predictionOptions)
      .where(
        and(
          eq(predictionOptions.id, input.optionId),
          eq(predictionOptions.poolId, p.id)
        )
      )
      .get();
    if (!option) {
      ctx.throwValidationError('optionId', 'Unknown answer');
    }

    // One answer per user; you can top up the same answer, not back two sides.
    const mine = await db
      .select()
      .from(predictionBets)
      .where(
        and(
          eq(predictionBets.poolId, p.id),
          eq(predictionBets.userId, ctx.userId)
        )
      )
      .all();
    if (mine.length && mine.some((b) => b.optionId !== input.optionId)) {
      ctx.throwValidationError('optionId', 'You already backed another answer');
    }

    const balance = await getBalance(ctx.userId);
    if (balance < input.amount) {
      ctx.throwValidationError('amount', 'Not enough social credit');
    }

    const ledgerEntryId = await createLedgerEntry(
      ctx.userId,
      -input.amount,
      p.id
    );
    await db
      .insert(predictionBets)
      .values({
        poolId: p.id,
        optionId: input.optionId,
        userId: ctx.userId,
        amount: input.amount,
        ledgerEntryId,
        createdAt: Date.now()
      })
      .run();

    await publishUser(ctx.userId, 'update');
    await broadcast();
    return stateFor(ctx.userId);
  });

const resolveRoute = protectedProcedure
  .input(z.object({ winningOptionId: z.number().int() }))
  .mutation(async ({ ctx, input }) => {
    const pool = await getCurrentPool();
    if (!pool) {
      ctx.throwValidationError('pool', 'No pool');
    }
    const p = pool!;

    if (p.creatorId !== ctx.userId) {
      ctx.throwValidationError('pool', 'Only the creator can resolve');
    }
    if (p.status !== 'open') {
      ctx.throwValidationError('pool', 'Already settled');
    }
    if (Date.now() < p.closesAt) {
      ctx.throwValidationError('pool', 'Betting is still open');
    }

    const option = await db
      .select({ id: predictionOptions.id })
      .from(predictionOptions)
      .where(
        and(
          eq(predictionOptions.id, input.winningOptionId),
          eq(predictionOptions.poolId, p.id)
        )
      )
      .get();
    if (!option) {
      ctx.throwValidationError('winningOptionId', 'Unknown answer');
    }

    const bets = await db
      .select()
      .from(predictionBets)
      .where(eq(predictionBets.poolId, p.id))
      .all();
    const totalPot = bets.reduce((sum, b) => sum + b.amount, 0);
    const winners = bets.filter((b) => b.optionId === input.winningOptionId);
    const winTotal = winners.reduce((sum, b) => sum + b.amount, 0);

    if (winTotal === 0) {
      // Nobody backed the winning answer: refund every stake.
      for (const b of bets) {
        if (b.ledgerEntryId != null)
          await updateLedgerEntry(b.ledgerEntryId, 0);
      }
    } else {
      // Parimutuel: winners split the whole pot in proportion to their stake.
      const payouts = winners.map((b) => ({
        b,
        payout: Math.floor((b.amount * totalPot) / winTotal)
      }));
      // Give the flooring remainder to the biggest winner so the pot is
      // conserved exactly (zero-sum). Losers keep their -stake ledger entry.
      const remainder = totalPot - payouts.reduce((s, x) => s + x.payout, 0);
      if (remainder > 0) {
        payouts.sort((a, b) => b.b.amount - a.b.amount);
        payouts[0]!.payout += remainder;
      }
      for (const { b, payout } of payouts) {
        if (b.ledgerEntryId != null) {
          await updateLedgerEntry(b.ledgerEntryId, payout - b.amount);
        }
      }
    }

    await db
      .update(predictionPools)
      .set({ status: 'resolved', winningOptionId: input.winningOptionId })
      .where(eq(predictionPools.id, p.id))
      .run();
    challengeEndsAtById.delete(p.id);

    for (const userId of new Set(bets.map((b) => b.userId))) {
      await publishUser(userId, 'update');
    }
    await broadcast();
    return stateFor(ctx.userId);
  });

const cancelRoute = protectedProcedure.mutation(async ({ ctx }) => {
  const pool = await getCurrentPool();
  if (!pool) {
    ctx.throwValidationError('pool', 'No pool');
  }
  const p = pool!;

  if (p.creatorId !== ctx.userId) {
    ctx.throwValidationError('pool', 'Only the creator can cancel');
  }
  if (p.status === 'resolved') {
    ctx.throwValidationError('pool', 'Already resolved');
  }

  const bets = await db
    .select()
    .from(predictionBets)
    .where(eq(predictionBets.poolId, p.id))
    .all();
  for (const b of bets) {
    if (b.ledgerEntryId != null) await updateLedgerEntry(b.ledgerEntryId, 0);
  }

  await db
    .update(predictionPools)
    .set({ status: 'void' })
    .where(eq(predictionPools.id, p.id))
    .run();
  challengeEndsAtById.delete(p.id);

  for (const userId of new Set(bets.map((b) => b.userId))) {
    await publishUser(userId, 'update');
  }
  await broadcast();
  return stateFor(ctx.userId);
});

// Server-wide pool, so the global publish/subscribe pair: every client listens.
const onUpdateRoute = protectedProcedure.subscription(({ ctx }) => {
  return ctx.pubsub.subscribe(ServerEvents.PREDICTION_POOL_UPDATE);
});

export const predictionRouter = t.router({
  getState: getStateRoute,
  create: createPoolRoute,
  stake: stakeRoute,
  resolve: resolveRoute,
  cancel: cancelRoute,
  onUpdate: onUpdateRoute
});
