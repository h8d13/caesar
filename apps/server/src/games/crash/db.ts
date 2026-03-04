import path from 'path';
import { Database } from 'bun:sqlite';
import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { DATA_PATH } from '../../helpers/paths';

const CRASH_DB_PATH = path.join(DATA_PATH, 'crash.db');
const CRASH_MIGRATIONS_PATH = path.join(
  import.meta.dir,
  'migrations'
);

let crashDb: BunSQLiteDatabase;

const initCrashDb = async () => {
  const sqlite = new Database(CRASH_DB_PATH, { create: true, strict: true });
  sqlite.run('PRAGMA foreign_keys = ON;');
  crashDb = drizzle({ client: sqlite });
  await migrate(crashDb, { migrationsFolder: CRASH_MIGRATIONS_PATH });
};

export { crashDb, initCrashDb };
