// One-time migration to client-derived authKeys (see PASSWORD_KDF): rows
// hashed from plaintext can't be converted, so every account gets a fresh
// temporary password, hashed the new way. Run once against a stopped
// server's DB; prints identity,name,temporaryPassword as CSV to relay.
//
//   tsx scripts/reset-all-passwords.ts /path/to/db.sqlite > passwords.csv

import { DELETED_USER_IDENTITY_AND_NAME } from '@caesar/shared';
import { users } from '@caesar/shared/db/schema';
import { eq, ne, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { createDbClient, DB_PRAGMAS } from '../src/db/connection';
import { generateTemporaryPassword } from '../src/utils/password';

const dbPath = process.argv[2];

if (!dbPath) {
  console.error('usage: tsx scripts/reset-all-passwords.ts <db.sqlite>');
  process.exit(1);
}

const db = drizzle(await createDbClient(`file:${dbPath}`, DB_PRAGMAS));

const rows = await db
  .select({ id: users.id, identity: users.identity, name: users.name })
  .from(users)
  .where(ne(users.identity, DELETED_USER_IDENTITY_AND_NAME));

// argon2 runs before the transaction so the write lock is held briefly
const resets = await Promise.all(
  rows.map(async (row) => ({
    ...row,
    ...(await generateTemporaryPassword(row.identity))
  }))
);

// all or nothing; the epoch bump revokes every session, as resetPassword does
await db.transaction(async (tx) => {
  for (const { id, hash } of resets) {
    await tx
      .update(users)
      .set({
        password: hash,
        sessionEpoch: sql`${users.sessionEpoch} + 1`,
        updatedAt: Date.now()
      })
      .where(eq(users.id, id));
  }
});

const csv = (value: string) => `"${value.replaceAll('"', '""')}"`;

console.log('identity,name,temporaryPassword');

for (const { identity, name, temporaryPassword } of resets) {
  console.log([identity, name, temporaryPassword].map(csv).join(','));
}

console.error(`reset ${resets.length} account(s)`);
