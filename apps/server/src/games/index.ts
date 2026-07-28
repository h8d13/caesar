import { initCoinflip } from './coinflip/init';
import { initCrash } from './crash/init';
import { initRoulette } from './roulette/init';

// Single boot entry point for the game runtimes, same shape as crons/ and
// runtimes/. Adding a game touches this file plus routers/index.ts, not the
// server bootstrap. Sequential on purpose: each init writes its opening round
// to the db, and the libsql writer is single-threaded anyway.
const initGames = async () => {
  await initCrash();
  await initRoulette();
  await initCoinflip();
};

export { initGames };
