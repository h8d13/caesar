import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { DB_PATH, DRIZZLE_PATH } from '../helpers/paths';
import { IS_PRODUCTION } from '../utils/env';
import { seedDatabase } from './seed';

let db: LibSQLDatabase;
let sqlite: Client;

const loadDb = async () => {
  sqlite = createClient({ url: `file:${DB_PATH}` });

  await sqlite.execute('PRAGMA journal_mode = WAL;');
  await sqlite.execute('PRAGMA synchronous = NORMAL;');
  await sqlite.execute('PRAGMA busy_timeout = 5000;');
  await sqlite.execute('PRAGMA cache_size = -32000;');
  await sqlite.execute('PRAGMA foreign_keys = ON;');

  db = drizzle(sqlite);

  await migrate(db, { migrationsFolder: DRIZZLE_PATH });

  // Prod only: rewrite the file to reclaim pages freed by DROP COLUMN /
  // UPDATE-to-NULL. Deleted bytes (old raw IPs from migration 0010) linger
  // in the free list and are forensically recoverable otherwise. Skipped
  // in dev because VACUUM grabs an exclusive writer lock for the full
  // rewrite and races tsx watch restarts (SQLITE_BUSY on the new instance).
  if (IS_PRODUCTION) {
    await sqlite.execute('VACUUM;');
  }

  await seedDatabase();
};

const closeDb = () => {
  try {
    sqlite?.close();
  } catch {
    // Already closed or never opened. Best-effort on shutdown.
  }
};

export { closeDb, db, loadDb };
