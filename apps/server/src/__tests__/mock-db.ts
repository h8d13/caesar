import { type LibSQLDatabase } from 'drizzle-orm/libsql';
import { vi } from 'vitest';

/**
 * This file is preloaded FIRST (via bunfig.toml) to mock the db module
 * before any other code imports it.
 *
 * Architecture:
 * 1. mock-db.ts (this file) - Creates initial db for module imports
 * 2. setup.ts - beforeEach creates fresh db for each test
 *
 * The initial db here ensures that helper functions (like getMockedToken)
 * that are imported at module-level can access a valid database.
 * Then setup.ts replaces it with a fresh db for each test.
 *
 * CRITICAL: We use a Proxy to ensure all database access goes through
 * the getter, so that setTestDb() properly updates the active database.
 */

let tdb: LibSQLDatabase;

// Create the proxy BEFORE the vi.mock factory could possibly run. vitest
// hoists vi.mock to the top, and any module-graph import of '../db/index'
// triggers the factory; if dbProxy were still in the TDZ at that point, the
// factory would throw and the module exports would never bind. The proxy
// safely tolerates `tdb` being undefined until initDb() finishes.
const dbProxy = new Proxy({} as LibSQLDatabase, {
  get(_target, prop) {
    return (tdb as any)?.[prop];
  },
  set(_target, prop, value) {
    (tdb as any)[prop] = value;
    return true;
  }
});

vi.mock('../db/index', () => ({
  db: dbProxy,
  loadDb: async () => {} // No-op in tests
}));

// Top-level await on initDb was needed under bun:test so module-import
// time db reads got a usable handle. Under vitest the top-level await
// combined with vi.mock hoisting + setupFiles ordering caused export
// bindings to read as undefined in consumers. setup.ts's beforeEach
// already creates a fresh db per test; the proxy tolerates a null tdb
// until that fires.

const setTestDb = (newDb: LibSQLDatabase) => {
  tdb = newDb;
};

export { setTestDb };
