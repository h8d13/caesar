// Runs once per vitest worker (via setupFiles). Each fork has its own
// DATA_PATH (suffixed with VITEST_POOL_ID), so dir prep is fork-local.

import { ensureServerDirs } from '../helpers/ensure-server-dirs';

await ensureServerDirs();
