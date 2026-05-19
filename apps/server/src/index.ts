// these two imports NEED to be at the very top in this order
// keep the "---------" because it forces prettier to not mess with the order, I can't turn this off here for some reason, need to check later
import { ensureServerDirs } from './helpers/ensure-server-dirs';
await ensureServerDirs();
// ----------------------------------------
import { loadEmbeds } from './utils/embeds';
await loadEmbeds();
// ----------------------------------------
import { IS_PRODUCTION, SERVER_VERSION } from './utils/env';
// ----------------------------------------
import { ActivityLogType } from '@caesar/shared';
import { config, SERVER_PRIVATE_IP } from './config';
import { loadCrons } from './crons';
import { loadDb } from './db';
import { initCoinflip } from './games/coinflip/init';
import { initCrash } from './games/crash/init';
import { initRoulette } from './games/roulette/init';
import { logger } from './logger';
import { enqueueActivityLog } from './queues/activity-log';
import { initVoiceRuntimes } from './runtimes';
import { createServers } from './utils/create-servers';
import { loadMediasoup, mediaSoupWorker } from './utils/mediasoup';

await loadDb();
await createServers();
await loadMediasoup();
await initVoiceRuntimes();
await loadCrons();
await initCrash();
await initRoulette();
await initCoinflip();

const host = IS_PRODUCTION ? SERVER_PRIVATE_IP : 'localhost';
const url = `http://${host}:${config.server.port}/`;

logger.info(`Caesar v${SERVER_VERSION} ready at ${url}`);

enqueueActivityLog({
  type: ActivityLogType.SERVER_STARTED
});

// Graceful shutdown. tsx watch sends SIGTERM on file change; if the
// mediasoup-worker child isn't closed first, it lingers and tsx loops
// "Previous process hasn't exited yet. Force killing..." indefinitely.
let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    mediaSoupWorker?.close();
  } catch {
    // mediasoup may already be down; ignore.
  }
  // Give the worker a moment to exit cleanly, then bail.
  setTimeout(() => process.exit(0), 200).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
