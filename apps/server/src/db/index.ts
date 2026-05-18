import { Database } from 'bun:sqlite';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite';
import { DB_PATH, DRIZZLE_PATH } from '../helpers/paths';
import { seedDatabase } from './seed';

let db: BunSQLiteDatabase;

const loadDb = async () => {
  const sqlite = new Database(DB_PATH, { create: true, strict: true });

  sqlite.run('PRAGMA journal_mode = WAL;');
  sqlite.run('PRAGMA synchronous = NORMAL;');
  sqlite.run('PRAGMA busy_timeout = 5000;');
  sqlite.run('PRAGMA cache_size = -32000;');
  sqlite.run('PRAGMA foreign_keys = ON;');

  db = drizzle({ client: sqlite });

  await migrate(db, { migrationsFolder: DRIZZLE_PATH });

  // Rewrite the file to reclaim pages freed by DROP COLUMN / UPDATE-to-NULL.
  // Without this, deleted bytes (e.g. old raw IPs from migration 0010)
  // linger in the file's free list and are forensically recoverable.
  sqlite.run('VACUUM;');

  await seedDatabase();
};

export { db, loadDb };
