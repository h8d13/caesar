import fs from 'fs/promises';
import os from 'os';
import path from 'path';

// Vitest globalSetup. The returned function runs once after the entire
// suite finishes. We pre-allocate the shared tempfile path here so workers
// (which see CAESAR_TEST_DB_PATH via env) can reuse it across files
// without each file's afterAll racing the next file's beforeAll.

export default async function globalSetup() {
  const tmpDbPath = path.join(
    os.tmpdir(),
    `caesar-test-${process.pid}-${Date.now()}.sqlite`
  );
  process.env.CAESAR_TEST_DB_PATH = tmpDbPath;

  return async () => {
    for (const suffix of ['', '-shm', '-wal']) {
      try {
        await fs.rm(`${tmpDbPath}${suffix}`, { force: true });
      } catch {
        // ignore
      }
    }
  };
}
