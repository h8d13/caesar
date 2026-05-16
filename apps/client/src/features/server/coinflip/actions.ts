import { store } from '@/features/store';
import { getTRPCClient } from '@/lib/trpc';
import type { CoinflipSide } from '@caesar/shared/games/coinflip';
import { coinflipSliceActions } from './slice';

export const fetchCoinflipState = async () => {
    const trpc = getTRPCClient();
    const state = await trpc.coinflip.getState.query();
    store.dispatch(coinflipSliceActions.setStateUpdate(state));
};

export const createCoinflipChallenge = async (
    side: CoinflipSide,
    amount: number
) => {
    const trpc = getTRPCClient();
    await trpc.coinflip.createChallenge.mutate({ side, amount });
};

export const acceptCoinflipChallenge = async (challengeId: number) => {
    const trpc = getTRPCClient();
    await trpc.coinflip.acceptChallenge.mutate({ challengeId });
};

export const cancelCoinflipChallenge = async (challengeId: number) => {
    const trpc = getTRPCClient();
    await trpc.coinflip.cancelChallenge.mutate({ challengeId });
};
