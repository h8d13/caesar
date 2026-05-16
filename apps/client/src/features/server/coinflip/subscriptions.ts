import { getTRPCClient } from '@/lib/trpc';
import type {
    TCoinflipResult,
    TCoinflipStateUpdate
} from '@caesar/shared/games/coinflip';
import { store } from '../../store';
import { coinflipSliceActions } from './slice';

const subscribeToCoinflip = () => {
    const trpc = getTRPCClient();

    const stateSub = trpc.coinflip.onStateUpdate.subscribe(undefined, {
        onData: (state: TCoinflipStateUpdate) => {
            store.dispatch(coinflipSliceActions.setStateUpdate(state));
        },
        onError: (err) => console.error('coinflip.onStateUpdate error:', err)
    });

    const resultSub = trpc.coinflip.onResult.subscribe(undefined, {
        onData: (result: TCoinflipResult) => {
            store.dispatch(coinflipSliceActions.addResult(result));
        },
        onError: (err) => console.error('coinflip.onResult error:', err)
    });

    return () => {
        stateSub.unsubscribe();
        resultSub.unsubscribe();
    };
};

export { subscribeToCoinflip };
