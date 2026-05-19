import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { DB_PATH, DRIZZLE_PATH } from '../helpers/paths';
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

  // Rewrite the file to reclaim pages freed by DROP COLUMN / UPDATE-to-NULL.
  // Without this, deleted bytes (e.g. old raw IPs from migration 0010)
  // linger in the file's free list and are forensically recoverable.
  await sqlite.execute('VACUUM;');

  await seedDatabase();
};

export { db, loadDb };
