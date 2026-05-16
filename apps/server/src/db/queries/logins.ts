import type { TLogin } from '@caesar/shared';
import { logins } from '@caesar/shared/db/schema';
import { desc, eq } from 'drizzle-orm';
import { db } from '..';

const getLastLogins = async (userId: number, limit = 10): Promise<TLogin[]> =>
  db
    .select()
    .from(logins)
    .where(eq(logins.userId, userId))
    .orderBy(desc(logins.createdAt))
    .limit(limit);

export { getLastLogins };
