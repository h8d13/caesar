import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { getServerToken } from '../db/queries/server';
import { DATA_PATH, DRIZZLE_PATH } from '../helpers/paths';
import { createHttpServer } from '../http';
import { clearRateLimitersForTests } from '../utils/rate-limiters/rate-limiter';
import { setTestDb } from './mock-db';
import { seedDatabase } from './seed';

/**
 * Global test setup - creates a fresh isolated database before each test.
 * This ensures tests don't interfere with each other.
 *
 * The database is:
 * 1. Created in-memory (fast, isolated)
 * 2. Migrated (applies schema)
 * 3. Seeded (with test data)
 * 4. Set as the mocked db (via setTestDb)
 * 5. Cleaned up after the test
 */

const DISABLE_CONSOLE = true;
// Disable per-file cleanup of DATA_PATH. With vitest's singleFork mode the
// same process runs every test file; deleting DATA_PATH between files races
// with the migrations dir prepare step in the next file's setup and tended
// to leave the worker in an unrecoverable state mid-suite.
const CLEANUP_AFTER_FINISH = false;

// vitest hoists vi.mock to the top of the file, so the factory cannot
// close over outer vars (they're not yet defined when the hoisted mock
// runs). Define the noop inline.
vi.mock('../logger', () => {
  const noop = () => {};
  return {
    logger: {
      info: noop,
      warn: noop,
      error: noop,
      debug: noop,
      trace: noop,
      fatal: noop
    }
  };
});

if (DISABLE_CONSOLE) {
  const noop = () => {};

  global.console.log = noop;
  global.console.info = noop;
  global.console.warn = noop;
  global.console.debug = noop;
}

let tdb: LibSQLDatabase;
let testsBaseUrl: string;

beforeAll(async () => {
  // One server + one libsql client per fork. Stash on globalThis since
  // vitest re-imports setupFiles per test file (isolate: true) while the
  // process itself persists.
  const g = globalThis as typeof globalThis & {
    __caesarServer?: { port: number; url: string };
    __caesarSqlite?: Client;
    __caesarUserTables?: string[];
    __caesarTmpDbPath?: string;
  };

  if (!g.__caesarServer) {
    const server = await createHttpServer(0);
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 9999;
    g.__caesarServer = { port, url: `http://localhost:${port}` };
  }

  if (!g.__caesarSqlite) {
    // libsql `:memory:` doesn't reliably share state across internal
    // connections that drizzle/migrate may open. Each fork mints its own
    // tempfile under the run-id prefix so globalSetup's teardown can
    // sweep the whole run in one pass.
    const runId =
      process.env.CAESAR_TEST_RUN_ID ?? `${process.pid}-${Date.now()}`;
    const tmpDbPath = path.join(
      os.tmpdir(),
      `caesar-test-${runId}-${process.pid}.sqlite`
    );
    g.__caesarTmpDbPath = tmpDbPath;
    const sqlite = createClient({ url: `file:${tmpDbPath}` });
    await sqlite.execute('PRAGMA foreign_keys = ON;');
    const localTdb = drizzle(sqlite);
    await migrate(localTdb, { migrationsFolder: DRIZZLE_PATH });
    const tablesRes = await sqlite.execute(
      "SELECT name FROM sqlite_master WHERE type='table' " +
        "AND name NOT LIKE 'sqlite_%' " +
        "AND name NOT LIKE '__drizzle%' " +
        "AND name <> 'sqlite_sequence';"
    );
    g.__caesarSqlite = sqlite;
    g.__caesarUserTables = tablesRes.rows.map((r) => r.name as string);
  }

  tdb = drizzle(g.__caesarSqlite);
  setTestDb(tdb);

  testsBaseUrl = g.__caesarServer.url;
});

beforeEach(async () => {
  clearRateLimitersForTests();

  const g = globalThis as typeof globalThis & {
    __caesarSqlite?: Client;
    __caesarUserTables?: string[];
  };
  const sqlite = g.__caesarSqlite!;
  const userTables = g.__caesarUserTables ?? [];

  // Wipe rows; reuse the migrated schema. FKs off during wipe so DELETE
  // order doesn't matter. AUTOINCREMENT counters reset via sqlite_sequence
  // so each test starts with id=1, matching the deterministic-ID semantics
  // tests were written against.
  await sqlite.execute('PRAGMA foreign_keys = OFF;');
  for (const table of userTables) {
    await sqlite.execute(`DELETE FROM "${table}";`);
  }
  await sqlite.execute('DELETE FROM sqlite_sequence;');
  await sqlite.execute('PRAGMA foreign_keys = ON;');

  await seedDatabase(tdb);

  // Warm the server-token cache (getServerTokenSync consumers: file tokens,
  // IP hashing, webauthn). loadDb does this in prod; tests seed directly.
  await getServerToken();
});

afterEach(() => {
  // No-op. Shared client/db persists for the fork lifetime.
});

afterAll(async () => {
  // Sqlite tempfile is cleaned by globalSetup teardown (once for the whole
  // suite). Per-file afterAll would race the next file's beforeAll under
  // isolate: false.
  if (!CLEANUP_AFTER_FINISH) return;

  try {
    await fs.rm(DATA_PATH, { recursive: true });
  } catch {
    // ignore
  }
});

export { tdb, testsBaseUrl };
