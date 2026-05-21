import {
  type TJoinedPublicUser,
  type TJoinedUser,
  type TStorageData
} from '@caesar/shared';
import { files, userRoles, users } from '@caesar/shared/db/schema';
import type { TTokenPayload } from '@server/types';
import { count, eq, sum } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import jwt from 'jsonwebtoken';
import { db } from '..';
import { getAllUserRoleIdsMap } from './roles';
import { getServerToken } from './server';
import {
  joinedUserBaseFields,
  publicUserBaseFields,
  socialCreditSubquery
} from './user-fields';

const getPublicUserById = async (
  userId: number
): Promise<TJoinedPublicUser | undefined> => {
  const avatarFiles = alias(files, 'avatarFiles');
  const bannerFiles = alias(files, 'bannerFiles');

  const results = await db
    .select({
      ...publicUserBaseFields,
      avatar: avatarFiles,
      banner: bannerFiles,
      socialCredit: socialCreditSubquery
    })
    .from(users)
    .leftJoin(avatarFiles, eq(users.avatarId, avatarFiles.id))
    .leftJoin(bannerFiles, eq(users.bannerId, bannerFiles.id))
    .where(eq(users.id, userId))
    .get();

  if (!results) return undefined;

  const roles = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
    .all();

  return {
    ...results,
    roleIds: roles.map((r) => r.roleId)
  };
};

const getPublicUsers = async (): Promise<TJoinedPublicUser[]> => {
  const avatarFiles = alias(files, 'avatarFiles');
  const bannerFiles = alias(files, 'bannerFiles');

  const results = await db
    .select({
      ...publicUserBaseFields,
      avatar: avatarFiles,
      banner: bannerFiles,
      socialCredit: socialCreditSubquery
    })
    .from(users)
    .leftJoin(avatarFiles, eq(users.avatarId, avatarFiles.id))
    .leftJoin(bannerFiles, eq(users.bannerId, bannerFiles.id))
    .all();

  const rolesMap = await getAllUserRoleIdsMap();

  return results.map((result) => ({
    ...result,
    roleIds: rolesMap[result.id] ?? []
  }));
};

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
  const avatarFiles = alias(files, 'avatarFiles');
  const bannerFiles = alias(files, 'bannerFiles');

  const user = await db
    .select({
      ...joinedUserBaseFields,
      socialCredit: socialCreditSubquery,
      avatar: avatarFiles,
      banner: bannerFiles
    })
    .from(users)
    .leftJoin(avatarFiles, eq(users.avatarId, avatarFiles.id))
    .leftJoin(bannerFiles, eq(users.bannerId, bannerFiles.id))
    .where(eq(users.id, userId))
    .get();

  if (!user) return undefined;

  const roles = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
    .all();

  return {
    ...user,
    password: '',
    avatar: user.avatar,
    banner: user.banner,
    roleIds: roles.map((r) => r.roleId)
  };
};

const getUserByIdentity = async (
  identity: string
): Promise<TJoinedUser | undefined> => {
  const avatarFiles = alias(files, 'avatarFiles');
  const bannerFiles = alias(files, 'bannerFiles');

  const user = await db
    .select({
      ...joinedUserBaseFields,
      password: users.password,
      socialCredit: socialCreditSubquery,
      avatar: avatarFiles,
      banner: bannerFiles
    })
    .from(users)
    .leftJoin(avatarFiles, eq(users.avatarId, avatarFiles.id))
    .leftJoin(bannerFiles, eq(users.bannerId, bannerFiles.id))
    .where(eq(users.identity, identity))
    .get();

  if (!user) return undefined;

  const roles = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, user.id))
    .all();

  return {
    ...user,
    avatar: user.avatar,
    banner: user.banner,
    roleIds: roles.map((r) => r.roleId)
  };
};

const getUserByToken = async (token: string | undefined) => {
  try {
    if (!token) return undefined;

    const decoded = jwt.verify(token, await getServerToken()) as TTokenPayload &
      { type?: string };

    // Reject pre-2FA tokens. They share the JWT secret but must never grant
    // a session: their only valid use is exchange via /login/2fa.
    if (decoded.type === 'pre-2fa') return undefined;

    // reject tokens minted before the user's current session superseded
    // by a newer login on another device. Backwards-compat: tokens issued
    // before this field existed lack `sessionEpoch`; treat them as epoch 0
    // so existing logins survive the migration but are kicked at next login.
    const epochRow = await db
      .select({ sessionEpoch: users.sessionEpoch })
      .from(users)
      .where(eq(users.id, decoded.userId))
      .get();

    if (!epochRow) return undefined;
    if ((decoded.sessionEpoch ?? 0) !== epochRow.sessionEpoch) return undefined;

    const user = await getUserById(decoded.userId);

    return user;
  } catch {
    return undefined;
  }
};

const getUsers = async (): Promise<TJoinedUser[]> => {
  const avatarFiles = alias(files, 'avatarFiles');
  const bannerFiles = alias(files, 'bannerFiles');

  const results = await db
    .select({
      ...joinedUserBaseFields,
      socialCredit: socialCreditSubquery,
      avatar: avatarFiles,
      banner: bannerFiles
    })
    .from(users)
    .leftJoin(avatarFiles, eq(users.avatarId, avatarFiles.id))
    .leftJoin(bannerFiles, eq(users.bannerId, bannerFiles.id))
    .all();

  const rolesMap = await getAllUserRoleIdsMap();

  return results.map((result) => ({
    ...result,
    password: '',
    roleIds: rolesMap[result.id] ?? []
  }));
};

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
