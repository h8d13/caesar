import { createGameLedgerBindings } from '../shared-bindings';
import { setRuntime } from './router';
import { CoinflipRuntime } from './runtime';

const initCoinflip = async () => {
  const runtime = new CoinflipRuntime(createGameLedgerBindings('coinflip'));

  setRuntime(runtime);
  await runtime.start();
};

export { initCoinflip };
