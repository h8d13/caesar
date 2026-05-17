import { createGameLedgerBindings } from '../shared-bindings';
import { setRuntime } from './router';
import { RouletteRuntime } from './runtime';

const initRoulette = async () => {
  const runtime = new RouletteRuntime(createGameLedgerBindings('roulette'));

  setRuntime(runtime);
  await runtime.start();
};

export { initRoulette };
