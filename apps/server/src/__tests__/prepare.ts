// Runs once per vitest worker (via setupFiles). Each fork has its own
// DATA_PATH (suffixed with VITEST_POOL_ID), so this copy is fork-local
// and doesn't race other forks' copies.

import { ensureServerDirs } from '../helpers/ensure-server-dirs';
import { loadEmbeds } from '../utils/embeds';

await ensureServerDirs();
await loadEmbeds();
