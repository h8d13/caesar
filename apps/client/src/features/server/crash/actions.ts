import { getTRPCClient } from '@/lib/trpc';
import { store } from '../../store';
import { crashSliceActions } from './slice';

export const openCrashGame = () =>
    store.dispatch(crashSliceActions.setIsOpen(true));

export const closeCrashGame = () =>
    store.dispatch(crashSliceActions.setIsOpen(false));

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
