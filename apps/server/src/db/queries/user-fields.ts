import { users } from '@caesar/shared/db/schema';
import { sql } from 'drizzle-orm';

// Common columns shared by every query that returns a TPublicUser-shaped
// record. Spread this into a drizzle .select({ ... }) and add the rest
// (avatar/banner joins, socialCredit) as needed.
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
  // count of non-expired status images ("stories"). drives the avatar ring
  // for every user without shipping the images; the list itself is fetched
  // lazily when a viewer opens. unixepoch()*1000 matches our ms timestamps.
  activeStatusCount: sql<number>`(SELECT COUNT(*) FROM status_images WHERE user_id = ${users.id} AND expires_at > (unixepoch() * 1000))`,
  createdAt: users.createdAt,
  // selected for redaction at the boundary: callers only forward this for
  // the requester's own row (see join handler), never to peers.
  appearOffline: users.appearOffline,
  allowMultipleSessions: users.allowMultipleSessions,
  sendDmReadReceipts: users.sendDmReadReceipts
};

// Superset for TJoinedUser-shaped queries: every public field plus the
// owner-only / admin-only columns (identity, ban metadata, session epoch,
// timestamps). Spread into a drizzle .select({ ... }) and add avatar/
// banner joins + socialCredit (+ optionally password) at the call site.
const joinedUserBaseFields = {
  ...publicUserBaseFields,
  identity: users.identity,
  updatedAt: users.updatedAt,
  lastLoginAt: users.lastLoginAt,
  sessionEpoch: users.sessionEpoch,
  banReason: users.banReason,
  bannedAt: users.bannedAt
};

const socialCreditSubquery = sql<number>`(SELECT COALESCE(SUM(amount), 0) FROM social_credit_ledger WHERE target_id = ${users.id})`;

export { joinedUserBaseFields, publicUserBaseFields, socialCreditSubquery };
