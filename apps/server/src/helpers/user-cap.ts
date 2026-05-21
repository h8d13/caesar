import { DELETED_USER_IDENTITY_AND_NAME } from '@caesar/shared';
import { users } from '@caesar/shared/db/schema';
import { count, ne } from 'drizzle-orm';
import { config } from '../config';
import { db } from '../db';

const getActiveUserCount = async (): Promise<number> => {
  const row = await db
    .select({ c: count() })
    .from(users)
    .where(ne(users.identity, DELETED_USER_IDENTITY_AND_NAME))
    .get();

  return row?.c ?? 0;
};

const getUserLimits = async (): Promise<{
  users: number;
  maxUsers: number;
}> => {
  const u = await getActiveUserCount();

  return { users: u, maxUsers: config.limits.maxUsers };
};

// Bootstrap (count==0) always bypasses so the first admin can register
// even when maxUsers=1.
const isAtUserCap = async (): Promise<boolean> => {
  if (config.limits.maxUsers <= 0) return false;

  const u = await getActiveUserCount();

  if (u === 0) return false;

  return u >= config.limits.maxUsers;
};

export { getActiveUserCount, getUserLimits, isAtUserCap };
