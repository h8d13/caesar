import {
  type TCoinflipResult,
  type TCoinflipStateUpdate
} from '@sharkord/shared/games/coinflip';
import { TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import { protectedProcedure, rateLimitedProcedure, t } from '../../utils/trpc';
import { MAX_BET, MIN_BET } from './constants';
import type { CoinflipRuntime } from './runtime';

let runtime: CoinflipRuntime;

const setRuntime = (r: CoinflipRuntime) => {
  runtime = r;
};

const getStateRoute = protectedProcedure.query(() => {
  return runtime.getState();
});

const createChallengeRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: 5,
  windowMs: 10_000,
  logLabel: 'coinflip.createChallenge'
})
  .input(
    z.object({
      side: z.enum(['heads', 'tails']),
      amount: z.number().int().min(MIN_BET).max(MAX_BET)
    })
  )
  .mutation(async ({ ctx, input }) => {
    try {
      const id = await runtime.createChallenge(
        ctx.userId,
        ctx.user.name,
        input.side as 'heads' | 'tails',
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

const acceptChallengeRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: 5,
  windowMs: 10_000,
  logLabel: 'coinflip.acceptChallenge'
})
  .input(z.object({ challengeId: z.number().int() }))
  .mutation(async ({ ctx, input }) => {
    try {
      await runtime.acceptChallenge(
        input.challengeId,
        ctx.userId,
        ctx.user.name
      );
    } catch (e) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: e instanceof Error ? e.message : 'Failed to accept challenge'
      });
    }
  });

const cancelChallengeRoute = rateLimitedProcedure(protectedProcedure, {
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

const onStateUpdateRoute = protectedProcedure.subscription(() => {
  return observable<TCoinflipStateUpdate>((observer) => {
    const unsub = runtime.subscribeToState((state) => observer.next(state));
    return { unsubscribe: unsub };
  });
});

const onResultRoute = protectedProcedure.subscription(() => {
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
