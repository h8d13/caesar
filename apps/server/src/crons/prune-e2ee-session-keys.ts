import { e2eeSessionKeys, users } from '@caesar/shared/db/schema';
import { lte, or, sql } from 'drizzle-orm';
import { db } from '../db';

// matches the session JWT's expiresIn (issueSession)
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Delete wrap keys whose session is gone: epoch bumped (logout, password
// change, sign-out-others, a newer single-session login) or token expired.
// Such rows are already unusable; this keeps them from lingering at rest.
const pruneE2eeSessionKeys = async () => {
  await db
    .delete(e2eeSessionKeys)
    .where(
      or(
        lte(e2eeSessionKeys.createdAt, Date.now() - SESSION_MAX_AGE_MS),
        sql`${e2eeSessionKeys.sessionEpoch} != (select ${users.sessionEpoch} from ${users} where ${users.id} = ${e2eeSessionKeys.userId})`
      )
    );
};

export { pruneE2eeSessionKeys };
