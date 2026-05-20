import {
  CoinflipSide,
  type TCoinflipResult,
  type TCoinflipStateUpdate
} from '@caesar/shared/games/coinflip';
import { gamesProcedure } from '@server/games/shared-bindings';
import { rateLimitedProcedure, t } from '@server/utils/trpc';
import { TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import { MAX_BET, MIN_BET } from './constants';
import type { CoinflipRuntime } from './runtime';

let runtime: CoinflipRuntime;

const setRuntime = (r: CoinflipRuntime) => {
  runtime = r;
};

const getStateRoute = gamesProcedure.query(() => {
  return runtime.getState();
});

const createChallengeRoute = rateLimitedProcedure(gamesProcedure, {
  maxRequests: 5,
  windowMs: 10_000,
  logLabel: 'coinflip.createChallenge'
})
  .input(
    z.object({
      side: z.nativeEnum(CoinflipSide),
      amount: z.number().int().min(MIN_BET).max(MAX_BET)
    })
  )
  .mutation(async ({ ctx, input }) => {
    try {
      const id = await runtime.createChallenge(
        ctx.userId,
        input.side,
        input.amount
      );
      return { challengeId: id };
    } catch (e) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: e instanceof Error ? e.message : 'Failed to create challenge'
      });
    }
  });

const acceptChallengeRoute = rateLimitedProcedure(gamesProcedure, {
  maxRequests: 5,
  windowMs: 10_000,
  logLabel: 'coinflip.acceptChallenge'
})
  .input(z.object({ challengeId: z.number().int() }))
  .mutation(async ({ ctx, input }) => {
    try {
      await runtime.acceptChallenge(input.challengeId, ctx.userId);
    } catch (e) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: e instanceof Error ? e.message : 'Failed to accept challenge'
      });
    }
  });

const cancelChallengeRoute = rateLimitedProcedure(gamesProcedure, {
  maxRequests: 5,
  windowMs: 10_000,
  logLabel: 'coinflip.cancelChallenge'
})
  .input(z.object({ challengeId: z.number().int() }))
  .mutation(async ({ ctx, input }) => {
    try {
      await runtime.cancelChallenge(input.challengeId, ctx.userId);
    } catch (e) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: e instanceof Error ? e.message : 'Failed to cancel challenge'
      });
    }
  });

const onStateUpdateRoute = gamesProcedure.subscription(() => {
  return observable<TCoinflipStateUpdate>((observer) => {
    const unsub = runtime.subscribeToState((state) => observer.next(state));
    return { unsubscribe: unsub };
  });
});

const onResultRoute = gamesProcedure.subscription(() => {
  return observable<TCoinflipResult>((observer) => {
    const unsub = runtime.subscribeToResult((result) => observer.next(result));
    return { unsubscribe: unsub };
  });
});

const coinflipRouter = t.router({
  getState: getStateRoute,
  createChallenge: createChallengeRoute,
  acceptChallenge: acceptChallengeRoute,
  cancelChallenge: cancelChallengeRoute,
  onStateUpdate: onStateUpdateRoute,
  onResult: onResultRoute
});

export { coinflipRouter, setRuntime };
