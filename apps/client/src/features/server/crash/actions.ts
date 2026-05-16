import { getTRPCClient } from '@/lib/trpc';
import { store } from '@/features/store';
import { crashSliceActions } from './slice';

export const fetchCrashState = async () => {
    const trpc = getTRPCClient();
    const state = await trpc.crash.getState.query();
    store.dispatch(crashSliceActions.setStateUpdate(state));
};

export const fetchCrashHistory = async () => {
    const trpc = getTRPCClient();
    const history = await trpc.crash.getHistory.query({ limit: 20 });
    store.dispatch(crashSliceActions.setRoundHistory(history));
};

export const placeBet = async (amount: number) => {
    const trpc = getTRPCClient();
    await trpc.crash.placeBet.mutate({ amount });
};

export const cashOut = async () => {
    const trpc = getTRPCClient();
    await trpc.crash.cashOut.mutate();
};
