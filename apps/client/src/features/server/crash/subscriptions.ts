import { getTRPCClient } from '@/lib/trpc';
import type {
  TCrashRoundResult,
  TCrashStateUpdate,
} from '@sharkord/shared/games/crash';
import { store } from '../../store';
import { crashSliceActions } from './slice';

const subscribeToCrash = () => {
  const trpc = getTRPCClient();

  const stateSub = trpc.crash.onStateUpdate.subscribe(undefined, {
    onData: (state: TCrashStateUpdate) => {
      store.dispatch(crashSliceActions.setStateUpdate(state));
    },
    onError: (err) => console.error('crash.onStateUpdate error:', err),
  });

  const resultSub = trpc.crash.onRoundResult.subscribe(undefined, {
    onData: (result: TCrashRoundResult) => {
      store.dispatch(
        crashSliceActions.addRoundToHistory({
          crashPoint: result.crashPoint,
          roundId: result.roundId,
        })
      );
    },
    onError: (err) => console.error('crash.onRoundResult error:', err),
  });

  return () => {
    stateSub.unsubscribe();
    resultSub.unsubscribe();
  };
};

export { subscribeToCrash };
