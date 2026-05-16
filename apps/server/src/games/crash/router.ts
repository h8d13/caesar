import type {
  TCrashRoundResult,
  TCrashStateUpdate
} from '@caesar/shared/games/crash';
import { TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import { protectedProcedure, rateLimitedProcedure, t } from '../../utils/trpc';
import { MAX_BET, MIN_BET } from './constants';
import type { CrashRuntime } from './runtime';

let runtime: CrashRuntime;

const setRuntime = (r: CrashRuntime) => {
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
  maxRequests: 5,
  windowMs: 10_000,
  logLabel: 'crash.placeBet'
})
  .input(z.object({ amount: z.number().int().min(MIN_BET).max(MAX_BET) }))
  .mutation(async ({ ctx, input }) => {
    try {
      await runtime.placeBet(ctx.userId, ctx.user.name, input.amount);
    } catch (e) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: e instanceof Error ? e.message : 'Failed to place bet'
      });
    }
  });

const cashOutRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: 5,
  windowMs: 10_000,
  logLabel: 'crash.cashOut'
}).mutation(async ({ ctx }) => {
  try {
    await runtime.cashOut(ctx.userId);
  } catch (e) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: e instanceof Error ? e.message : 'Failed to cash out'
    });
  }
});

const onStateUpdateRoute = protectedProcedure.subscription(() => {
  return observable<TCrashStateUpdate>((observer) => {
    const unsub = runtime.subscribeToState((state) => observer.next(state));
    return { unsubscribe: unsub };
  });
});

const onRoundResultRoute = protectedProcedure.subscription(() => {
  return observable<TCrashRoundResult>((observer) => {
    const unsub = runtime.subscribeToResult((result) => observer.next(result));
    return { unsubscribe: unsub };
  });
});

const crashRouter = t.router({
  getState: getStateRoute,
  getHistory: getHistoryRoute,
  placeBet: placeBetRoute,
  cashOut: cashOutRoute,
  onStateUpdate: onStateUpdateRoute,
  onRoundResult: onRoundResultRoute
});

export { crashRouter, setRuntime };
