import {
  type TJoinedPublicUser,
  type TJoinedUser,
  type TStorageData
} from '@caesar/shared';
import { files, userRoles, users } from '@caesar/shared/db/schema';
import type { TTokenPayload } from '@server/types';
import { verifyJwt } from '@server/utils/jwt-secret';
import { type Column, count, eq, sql, sum, type SQL } from 'drizzle-orm';
import { db } from '..';
import { prepared } from '../prepared';
import {
  fileByIdJson,
  jsonArrayOf,
  jsonObject,
  jsonRow,
  jsonRows,
  precompile
} from './json-sql';
import { joinedUserBaseFields, publicUserBaseFields } from './user-fields';

const userRelationsJson = {
  avatar: fileByIdJson('avatar_file', users.avatarId),
  banner: fileByIdJson('banner_file', users.bannerId),
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

const usersJsonQuery = (json: SQL) =>
  prepared(() => db.select({ user: sql`${json}` }).from(users));

const userJsonByQuery = (json: SQL, key: Column) =>
  prepared(() =>
    db
      .select({ user: sql`${json}` })
      .from(users)
      .where(eq(key, sql.placeholder('key')))
  );

const publicUsersQuery = usersJsonQuery(publicUserJson);
const publicUserByIdQuery = userJsonByQuery(publicUserJson, users.id);
const usersQuery = usersJsonQuery(joinedUserJson);
const userByIdQuery = userJsonByQuery(joinedUserJson, users.id);
const userByIdentityQuery = userJsonByQuery(
  joinedUserWithPasswordJson,
  users.identity
);

const getPublicUserById = async (
  userId: number
): Promise<TJoinedPublicUser | undefined> =>
  jsonRow<TJoinedPublicUser>(publicUserByIdQuery(), { key: userId });

const getPublicUsers = async (): Promise<TJoinedPublicUser[]> =>
  jsonRows<TJoinedPublicUser>(publicUsersQuery());

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

const getUserById = async (userId: number): Promise<TJoinedUser | undefined> =>
  jsonRow<TJoinedUser>(userByIdQuery(), { key: userId });

const getUserByIdentity = async (
  identity: string
): Promise<TJoinedUser | undefined> =>
  jsonRow<TJoinedUser>(userByIdentityQuery(), { key: identity });

const sessionByIdQuery = prepared(() =>
  db
    .select({
      id: users.id,
      sessionEpoch: users.sessionEpoch,
      banned: users.banned
    })
    .from(users)
    .where(eq(users.id, sql.placeholder('id')))
);

// The one session gate. `load` only picks how much of the user to read:
// HTTP routes only authorize and skip the joined user JSON; the WS
// handshake loads it once for ctx.user.
const resolveSessionToken = async <
  T extends { sessionEpoch: number; banned: boolean }
>(
  token: string | undefined,
  load: (userId: number) => Promise<T | undefined>
) => {
  try {
    if (!token) return;

    const decoded = await verifyJwt<TTokenPayload & { type?: string }>(token);

    // Reject pre-2FA tokens. They share the JWT secret but must never grant
    // a session: their only valid use is exchange via /login/2fa.
    if (decoded.type === 'pre-2fa') return;

    const user = await load(decoded.userId);

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

const getUserByToken = (token: string | undefined) =>
  resolveSessionToken(token, getUserById);

const getSessionUserByToken = (token: string | undefined) =>
  resolveSessionToken(token, (id) => sessionByIdQuery().get({ id }));

const getUsers = async (): Promise<TJoinedUser[]> =>
  jsonRows<TJoinedUser>(usersQuery());

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
  getSessionUserByToken,
  getUserByToken,
  getUsers
};
