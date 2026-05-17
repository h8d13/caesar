import { createGameLedgerBindings } from '../shared-bindings';
import { setRuntime } from './router';
import { CrashRuntime } from './runtime';

const initCrash = async () => {
  const runtime = new CrashRuntime(createGameLedgerBindings('crash'));

  setRuntime(runtime);
  await runtime.start();
};

export { initCrash };
