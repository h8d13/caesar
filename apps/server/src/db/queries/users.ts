import {
  type TJoinedPublicUser,
  type TJoinedUser,
  type TStorageData
} from '@caesar/shared';
import { files, userRoles, users } from '@caesar/shared/db/schema';
import type { TTokenPayload } from '@server/types';
import { verifyJwt } from '@server/utils/jwt-secret';
import { count, eq, sql, sum, type SQL } from 'drizzle-orm';
import { db } from '..';
import {
  fileByIdJson,
  jsonArrayOf,
  jsonObject,
  parseJson,
  precompile
} from './json-sql';
import {
  joinedUserBaseFields,
  publicUserBaseFields,
  socialCreditSubquery
} from './user-fields';

const userRelationsJson = {
  avatar: fileByIdJson('avatar_file', users.avatarId),
  banner: fileByIdJson('banner_file', users.bannerId),
  socialCredit: socialCreditSubquery,
  roleIds: jsonArrayOf(
    sql`${userRoles.roleId} ORDER BY ${userRoles.roleId}`,
    sql`FROM ${userRoles} WHERE ${userRoles.userId} = ${users.id}`
  )
};

const publicUserJson = precompile(
  jsonObject({
    ...publicUserBaseFields,
    ...userRelationsJson
  })
);

// password stays server-side unless a caller verifies it (login)
const joinedUserJson = precompile(
  jsonObject({
    ...joinedUserBaseFields,
    ...userRelationsJson,
    password: sql`''`
  })
);

const joinedUserWithPasswordJson = precompile(
  jsonObject({
    ...joinedUserBaseFields,
    ...userRelationsJson,
    password: users.password
  })
);

const selectUsersJson = async <T>(json: SQL, where?: SQL): Promise<T[]> => {
  const rows = await db.all<{ user: string }>(
    sql`SELECT ${json} AS user FROM ${users}
      ${where ? sql`WHERE ${where}` : sql``}`
  );

  return rows.map((row) => parseJson<T>(row.user));
};

const getPublicUserById = async (
  userId: number
): Promise<TJoinedPublicUser | undefined> => {
  const [user] = await selectUsersJson<TJoinedPublicUser>(
    publicUserJson,
    eq(users.id, userId)
  );

  return user;
};

const getPublicUsers = async (): Promise<TJoinedPublicUser[]> =>
  selectUsersJson<TJoinedPublicUser>(publicUserJson);

const getStorageUsageByUserId = async (
  userId: number
): Promise<TStorageData> => {
  const result = await db
    .select({
      fileCount: count(files.id),
      usedStorage: sum(files.size)
    })
    .from(files)
    .where(eq(files.userId, userId))
    .get();

  return {
    userId,
    fileCount: result?.fileCount ?? 0,
    usedStorage: Number(result?.usedStorage ?? 0)
  };
};

const getUserById = async (
  userId: number
): Promise<TJoinedUser | undefined> => {
  const [user] = await selectUsersJson<TJoinedUser>(
    joinedUserJson,
    eq(users.id, userId)
  );

  return user;
};

const getUserByIdentity = async (
  identity: string
): Promise<TJoinedUser | undefined> => {
  const [user] = await selectUsersJson<TJoinedUser>(
    joinedUserWithPasswordJson,
    eq(users.identity, identity)
  );

  return user;
};

const getUserByToken = async (token: string | undefined) => {
  try {
    if (!token) return;

    const decoded = await verifyJwt<TTokenPayload & { type?: string }>(token);

    // Reject pre-2FA tokens. They share the JWT secret but must never grant
    // a session: their only valid use is exchange via /login/2fa.
    if (decoded.type === 'pre-2fa') return;

    const user = await getUserById(decoded.userId);

    // reject tokens minted before the user's current session: superseded
    // by a newer login, a logout, or a password change.
    if (!user || decoded.sessionEpoch !== user.sessionEpoch) return;

    // banned users keep a valid epoch; every HTTP route (upload, private
    // files) and the WS handshake gate on this, so refuse them here.
    if (user.banned) return;

    return user;
  } catch {
    // malformed, expired or forged token: no user
  }
};

const getUsers = async (): Promise<TJoinedUser[]> =>
  selectUsersJson<TJoinedUser>(joinedUserJson);

const getAllUserIds = async (): Promise<number[]> => {
  const results = await db.select({ id: users.id }).from(users);
  return results.map((r) => r.id);
};

export {
  getAllUserIds,
  getPublicUserById,
  getPublicUsers,
  getStorageUsageByUserId,
  getUserById,
  getUserByIdentity,
  getUserByToken,
  getUsers
};
