import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { ensureServerDirs } from '../helpers/ensure-server-dirs';
import { loadEmbeds } from '../utils/embeds';

// Vitest globalSetup. Runs once in the parent process before any fork
// spins up. Centralizing the data-dir + migrations prep here avoids the
// race that happens when every fork's setupFile does `fs.cp` into the
// same DRIZZLE_PATH in parallel.
//
// Also stamps a run ID so each fork can mint its own sqlite tempfile
// under one prefix; teardown sweeps the prefix in one pass.

export default async function globalSetup() {
  await ensureServerDirs();
  await loadEmbeds();

  const runId = `${process.pid}-${Date.now()}`;
  process.env.CAESAR_TEST_RUN_ID = runId;

  return async () => {
    const tmp = os.tmpdir();
    try {
      const entries = await fs.readdir(tmp);
      const prefix = `caesar-test-${runId}-`;
      await Promise.all(
        entries
          .filter((e) => e.startsWith(prefix))
          .map((e) => fs.rm(path.join(tmp, e), { force: true }))
      );
    } catch {
      // ignore
    }
  };
}
