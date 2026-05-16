import { store } from '@/features/store';
import { getTRPCClient } from '@/lib/trpc';
import type { RouletteBetType } from '@caesar/shared/games/roulette';
import { rouletteSliceActions } from './slice';

export const fetchRouletteState = async () => {
    const trpc = getTRPCClient();
    const state = await trpc.roulette.getState.query();
    store.dispatch(rouletteSliceActions.setStateUpdate(state));
};

export const fetchRouletteHistory = async () => {
    const trpc = getTRPCClient();
    const history = await trpc.roulette.getHistory.query({ limit: 20 });
    store.dispatch(rouletteSliceActions.setRoundHistory(history));
};

export const placeRouletteBet = async (
    betType: RouletteBetType,
    betValue: number | null,
    amount: number
) => {
    const trpc = getTRPCClient();
    await trpc.roulette.placeBet.mutate({ betType, betValue, amount });
};

export const placeRouletteBets = async (
    bets: {
        betType: RouletteBetType;
        betValue: number | null;
        amount: number;
    }[]
) => {
    const trpc = getTRPCClient();
    return trpc.roulette.placeBets.mutate({ bets });
};

export const removeRouletteBet = async (betId: number) => {
    const trpc = getTRPCClient();
    await trpc.roulette.removeBet.mutate({ betId });
};
