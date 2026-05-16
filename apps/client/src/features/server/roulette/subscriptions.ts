import { getTRPCClient } from '@/lib/trpc';
import type {
    TRouletteRoundResult,
    TRouletteStateUpdate
} from '@caesar/shared/games/roulette';
import { store } from '../../store';
import { rouletteSliceActions } from './slice';

const subscribeToRoulette = () => {
    const trpc = getTRPCClient();

    const stateSub = trpc.roulette.onStateUpdate.subscribe(undefined, {
        onData: (state: TRouletteStateUpdate) => {
            store.dispatch(rouletteSliceActions.setStateUpdate(state));
        },
        onError: (err) => console.error('roulette.onStateUpdate error:', err)
    });

    const resultSub = trpc.roulette.onRoundResult.subscribe(undefined, {
        onData: (result: TRouletteRoundResult) => {
            store.dispatch(
                rouletteSliceActions.addRoundToHistory({
                    winningNumber: result.winningNumber,
                    roundId: result.roundId,
                    lightningNumbers: result.lightningNumbers
                })
            );
            store.dispatch(rouletteSliceActions.addRoundWins(result.bets));
        },
        onError: (err) => console.error('roulette.onRoundResult error:', err)
    });

    return () => {
        stateSub.unsubscribe();
        resultSub.unsubscribe();
    };
};

export { subscribeToRoulette };
