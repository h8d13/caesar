import { type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { DB_PATH, DRIZZLE_PATH } from '../helpers/paths';
import { IS_PRODUCTION } from '../utils/env';
import { createDbClient, DB_PRAGMAS } from './connection';
import { getServerToken } from './queries/server';
import { seedDatabase } from './seed';

let db: LibSQLDatabase;
let sqlite: Client;

const loadDb = async () => {
  sqlite = await createDbClient(`file:${DB_PATH}`, DB_PRAGMAS);

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

  // Warm the in-memory server-token cache so getServerTokenSync (file
  // tokens, IP hashing, webauthn) works without a prior async read. Session
  // JWTs moved to jwt.key, so nothing else calls getServerToken at boot.
  await getServerToken();
};

const closeDb = () => {
  try {
    sqlite?.close();
  } catch {
    // Already closed or never opened. Best-effort on shutdown.
  }
};

export { closeDb, db, loadDb };
