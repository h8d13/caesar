import fs from 'fs/promises';
import os from 'os';
import path from 'path';

// Vitest globalSetup. Stamps a run ID so each fork can key its sqlite
// tempfile under one prefix, and the post-suite teardown sweeps both the
// tempfiles and the per-fork data-test-<poolId> dirs in one pass.
//
// Per-fork dir prep (ensureServerDirs + loadEmbeds) lives in
// setupFiles/prepare.ts, since DATA_PATH is fork-specific.

export default async function globalSetup() {
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

    // Sweep per-fork data dirs (data-test-1, data-test-2, ...) left
    // behind by parallel workers. The non-suffixed `data-test` is the
    // dev/legacy single-fork path and gets left alone.
    try {
      const serverDir = process.cwd();
      const entries = await fs.readdir(serverDir);
      await Promise.all(
        entries
          .filter((e) => /^data-test-\d+$/.test(e))
          .map((e) =>
            fs.rm(path.join(serverDir, e), { recursive: true, force: true })
          )
      );
    } catch {
      // ignore
    }
  };
}
