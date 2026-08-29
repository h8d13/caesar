import type { TLogin } from '@caesar/shared';
import { logins } from '@caesar/shared/db/schema';
import { desc, eq } from 'drizzle-orm';
import { db } from '..';

const getLastLogins = async (
  userId: number,
  limit: number
): Promise<TLogin[]> =>
  db
    .select()
    .from(logins)
    .where(eq(logins.userId, userId))
    .orderBy(desc(logins.createdAt), desc(logins.id))
    .limit(limit);

// Mod view renders only the most recent hashed ip. Selecting the single
// column keeps whole login rows off the wire for one field. createdAt is
// ms precision and two logins can share one, so id breaks the tie.
const getLastLoginIp = async (userId: number): Promise<string | null> => {
  const row = await db
    .select({ ip: logins.ip })
    .from(logins)
    .where(eq(logins.userId, userId))
    .orderBy(desc(logins.createdAt), desc(logins.id))
    .limit(1)
    .get();

  return row?.ip ?? null;
};

export { getLastLoginIp, getLastLogins };
