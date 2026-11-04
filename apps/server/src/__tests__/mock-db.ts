import { type LibSQLDatabase } from 'drizzle-orm/libsql';
import { vi } from 'vite-plus/test';

// Second setupFile (after prepare.ts): mocks ../db/index with a proxy so
// every access goes through `tdb`; setup.ts beforeAll points it at the
// fork's DB via setTestDb.

let tdb: LibSQLDatabase;

// Create the proxy BEFORE the vi.mock factory could possibly run. vitest
// hoists vi.mock to the top, and any module-graph import of '../db/index'
// triggers the factory; if dbProxy were still in the TDZ at that point, the
// factory would throw and the module exports would never bind. The proxy
// safely tolerates `tdb` being undefined until setTestDb() runs.
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

const setTestDb = (newDb: LibSQLDatabase) => {
  tdb = newDb;
};

export { setTestDb };
