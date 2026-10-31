import {
  ActivityLogType,
  type TActivityLogEntry,
  type TJoinedInvite
} from '@caesar/shared';
import {
  activityLog,
  files,
  invites,
  roles,
  users
} from '@caesar/shared/db/schema';
import { desc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '..';
import { getAllUserRoleIdsMap } from './roles';
import { publicUserBaseFields } from './user-fields';

const getInvites = async (): Promise<TJoinedInvite[]> => {
  const avatarFiles = alias(files, 'avatarFiles');
  const bannerFiles = alias(files, 'bannerFiles');

  const rows = await db
    .select({
      invite: invites,
      creator: publicUserBaseFields,
      avatar: avatarFiles,
      banner: bannerFiles,
      role: {
        id: roles.id,
        name: roles.name,
        color: roles.color
      }
    })
    .from(invites)
    .innerJoin(users, eq(invites.creatorId, users.id))
    .leftJoin(avatarFiles, eq(users.avatarId, avatarFiles.id))
    .leftJoin(bannerFiles, eq(users.bannerId, bannerFiles.id))
    .leftJoin(roles, eq(invites.roleId, roles.id));

  const rolesMap = await getAllUserRoleIdsMap();

  return rows.map((row) => ({
    ...row.invite,
    creator: {
      ...row.creator,
      avatar: row.avatar,
      banner: row.banner,
      roleIds: rolesMap[row.creator.id] ?? []
    },
    role: row.role?.id ? row.role : null
  }));
};

const INVITE_LOG_TYPES = [
  ActivityLogType.CREATED_INVITE,
  ActivityLogType.DELETED_INVITE,
  ActivityLogType.USED_INVITE
];

// Newest first. ip stays server-side; rows of deleted users are gone with
// them (activity_log cascades on user delete).
const getInviteLog = async (limit: number): Promise<TActivityLogEntry[]> =>
  db
    .select({
      id: activityLog.id,
      type: activityLog.type,
      userId: activityLog.userId,
      details: activityLog.details,
      createdAt: activityLog.createdAt
    })
    .from(activityLog)
    .where(inArray(activityLog.type, INVITE_LOG_TYPES))
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
    .limit(limit);

export { getInviteLog, getInvites };
