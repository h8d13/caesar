import type {
  TRouletteRoundResult,
  TRouletteStateUpdate
} from '@caesar/shared/games/roulette';
import { RouletteBetType } from '@caesar/shared/games/roulette';
import { TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import { protectedProcedure, rateLimitedProcedure, t } from '@server/utils/trpc';
import { MAX_BET, MAX_BETS_PER_USER, MIN_BET } from './constants';
import type { RouletteRuntime } from './runtime';

let runtime: RouletteRuntime;

const setRuntime = (r: RouletteRuntime) => {
  runtime = r;
};

const getStateRoute = protectedProcedure.query(() => {
  return runtime.getState();
});

const getHistoryRoute = protectedProcedure
  .input(z.object({ limit: z.number().min(1).max(50).default(20) }))
  .query(({ input }) => {
    return runtime.getHistory(input.limit);
  });

const placeBetRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: 15,
  windowMs: 15_000,
  logLabel: 'roulette.placeBet'
})
  .input(
    z.object({
      betType: z.nativeEnum(RouletteBetType),
      betValue: z.number().int().min(0).max(36).nullable(),
      amount: z.number().int().min(MIN_BET).max(MAX_BET)
    })
  )
  .mutation(async ({ ctx, input }) => {
    try {
      await runtime.placeBet(
        ctx.userId,
        ctx.user.name,
        input.betType,
        input.betValue,
        input.amount
      );
    } catch (e) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: e instanceof Error ? e.message : 'Failed to place bet'
      });
    }
  });

const placeBetsRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: 5,
  windowMs: 15_000,
  logLabel: 'roulette.placeBets'
})
  .input(
    z.object({
      bets: z
        .array(
          z.object({
            betType: z.nativeEnum(RouletteBetType),
            betValue: z.number().int().min(0).max(36).nullable(),
            amount: z.number().int().min(MIN_BET).max(MAX_BET)
          })
        )
        .min(1)
        .max(MAX_BETS_PER_USER)
    })
  )
  .mutation(async ({ ctx, input }) => {
    const errors: string[] = [];
    for (const bet of input.bets) {
      try {
        await runtime.placeBet(
          ctx.userId,
          ctx.user.name,
          bet.betType,
          bet.betValue,
          bet.amount
        );
      } catch (e) {
        errors.push(e instanceof Error ? e.message : 'Failed to place bet');
      }
    }
    if (errors.length > 0 && errors.length === input.bets.length) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: errors[0]!
      });
    }
    return { placed: input.bets.length - errors.length, errors };
  });

const removeBetRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: 15,
  windowMs: 15_000,
  logLabel: 'roulette.removeBet'
})
  .input(z.object({ betId: z.number().int() }))
  .mutation(async ({ ctx, input }) => {
    try {
      await runtime.removeBet(ctx.userId, input.betId);
    } catch (e) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: e instanceof Error ? e.message : 'Failed to remove bet'
      });
    }
  });

const onStateUpdateRoute = protectedProcedure.subscription(() => {
  return observable<TRouletteStateUpdate>((observer) => {
    const unsub = runtime.subscribeToState((state) => observer.next(state));
    return { unsubscribe: unsub };
  });
});

const onRoundResultRoute = protectedProcedure.subscription(() => {
  return observable<TRouletteRoundResult>((observer) => {
    const unsub = runtime.subscribeToResult((result) => observer.next(result));
    return { unsubscribe: unsub };
  });
});

const rouletteRouter = t.router({
  getState: getStateRoute,
  getHistory: getHistoryRoute,
  placeBet: placeBetRoute,
  placeBets: placeBetsRoute,
  removeBet: removeBetRoute,
  onStateUpdate: onStateUpdateRoute,
  onRoundResult: onRoundResultRoute
});

export { rouletteRouter, setRuntime };
