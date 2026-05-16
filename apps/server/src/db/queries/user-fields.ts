import { sql } from 'drizzle-orm';
import { users } from '../schema';

// Common columns shared by every query that returns a TPublicUser-shaped
// record. Spread this into a drizzle .select({ ... }) and add the rest
// (avatar/banner joins, socialCredit, _identity) as needed.
//
// When TPublicUser gains a new field, add it here once instead of patching
// every caller.
const publicUserBaseFields = {
  id: users.id,
  name: users.name,
  bannerColor: users.bannerColor,
  bio: users.bio,
  birthday: users.birthday,
  banned: users.banned,
  avatarId: users.avatarId,
  bannerId: users.bannerId,
  createdAt: users.createdAt
};

const socialCreditSubquery = sql<number>`(SELECT COALESCE(SUM(amount), 0) FROM social_credit_ledger WHERE target_id = ${users.id})`;

export { publicUserBaseFields, socialCreditSubquery };
