import { users } from '@caesar/shared/db/schema';
import { sql } from 'drizzle-orm';

// Peer-safe columns of a TPublicUser-shaped record: anything embedding a
// user (emoji/sound uploader, invite creator) uses this as is.
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
  socialCredit: users.socialCredit,
  // count of non-expired status images ("stories"). drives the avatar ring
  // for every user without shipping the images; the list itself is fetched
  // lazily when a viewer opens. unixepoch()*1000 matches our ms timestamps.
  activeStatusCount: sql<number>`(SELECT COUNT(*) FROM status_images WHERE user_id = ${users.id} AND expires_at > (unixepoch() * 1000))`,
  createdAt: users.createdAt
};

// Per-user settings. Selected only where the server needs them (status
// masking in join and user broadcasts, admin rows); rows to peers go
// through stripSelfOnlyFields, only the own row keeps them.
const selfOnlyUserFields = {
  appearOffline: users.appearOffline,
  allowMultipleSessions: users.allowMultipleSessions,
  sendDmReadReceipts: users.sendDmReadReceipts
};

// Superset for TJoinedUser-shaped queries: every public field plus the
// owner-only / admin-only columns (identity, ban metadata, session epoch,
// timestamps). Spread into a drizzle .select({ ... }) and add avatar/
// banner joins (+ optionally password) at the call site.
const joinedUserBaseFields = {
  ...publicUserBaseFields,
  ...selfOnlyUserFields,
  identity: users.identity,
  updatedAt: users.updatedAt,
  lastLoginAt: users.lastLoginAt,
  sessionEpoch: users.sessionEpoch,
  banReason: users.banReason,
  bannedAt: users.bannedAt,
  invitedBy: users.invitedBy
};

type TSelfOnlyFields = {
  appearOffline?: unknown;
  allowMultipleSessions?: unknown;
  sendDmReadReceipts?: unknown;
};

const stripSelfOnlyFields = <T extends TSelfOnlyFields>({
  appearOffline: _appearOffline,
  allowMultipleSessions: _allowMultipleSessions,
  sendDmReadReceipts: _sendDmReadReceipts,
  ...peerSafe
}: T): Omit<T, keyof TSelfOnlyFields> => peerSafe;

export {
  joinedUserBaseFields,
  publicUserBaseFields,
  selfOnlyUserFields,
  stripSelfOnlyFields
};
