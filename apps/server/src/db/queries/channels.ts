import {
  ChannelPermission,
  OWNER_ROLE_ID,
  type TChannel,
  type TChannelUserPermissionsMap,
  type TReadStateMap
} from '@caesar/shared';
import {
  channelReadStates,
  channelRolePermissions,
  channels,
  channelUserPermissions,
  messages,
  userRoles
} from '@caesar/shared/db/schema';
import { invariant } from '@server/utils/invariant';
import { getOnlineUserIds } from '@server/utils/wss';
import { and, eq, exists, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '..';
import {
  getDirectMessageChannelIdsForUser,
  getDirectMessageChannelParticipantIds
} from './dms';
import { getUserRoleIds } from './roles';
import { getAllUserIds } from './users';

const getPermissions = async (
  userId: number,
  roleIds: number[],
  permission: ChannelPermission,
  channelId?: number
) => {
  const userPermissionsQuery = db
    .select({
      channelId: channelUserPermissions.channelId,
      allow: channelUserPermissions.allow
    })
    .from(channelUserPermissions)
    .where(
      and(
        eq(channelUserPermissions.userId, userId),
        eq(channelUserPermissions.permission, permission),
        channelId ? eq(channelUserPermissions.channelId, channelId) : undefined
      )
    );

  let rolePermissionsQuery = null;

  if (roleIds.length > 0) {
    rolePermissionsQuery = db
      .select({
        channelId: channelRolePermissions.channelId,
        allow: channelRolePermissions.allow
      })
      .from(channelRolePermissions)
      .where(
        and(
          inArray(channelRolePermissions.roleId, roleIds),
          eq(channelRolePermissions.permission, permission),
          channelId
            ? eq(channelRolePermissions.channelId, channelId)
            : undefined
        )
      );
  }

  const [userPermissions, rolePermissions] = await Promise.all([
    userPermissionsQuery,
    rolePermissionsQuery || Promise.resolve([])
  ]);

  const userPermissionMap = new Map(
    userPermissions.map((p) => [p.channelId, p.allow])
  );

  const rolePermissionMap = new Map<number, boolean>();

  for (const perm of rolePermissions) {
    const existing = rolePermissionMap.get(perm.channelId);

    rolePermissionMap.set(perm.channelId, existing || perm.allow);
  }

  return { userPermissionMap, rolePermissionMap };
};

const getChannelsForUser = async (userId: number): Promise<TChannel[]> => {
  const roleIds = await getUserRoleIds(userId);
  const isOwner = roleIds.includes(OWNER_ROLE_ID);

  const [allChannels, { userPermissionMap, rolePermissionMap }, dmChannelIds] =
    await Promise.all([
      db.select().from(channels),
      getPermissions(userId, roleIds, ChannelPermission.VIEW_CHANNEL),
      getDirectMessageChannelIdsForUser(userId)
    ]);

  const accessibleChannels = allChannels.filter((channel) => {
    // DMs by participation only: the owner bypass below must not reach
    // another pair's conversation
    if (channel.isDm) return dmChannelIds.includes(channel.id);

    if (isOwner || !channel.private) return true;

    const userPerm = userPermissionMap.get(channel.id);

    if (userPerm !== undefined) {
      return userPerm;
    }

    const rolePerm = rolePermissionMap.get(channel.id);

    return rolePerm;
  });

  return accessibleChannels;
};

const getAllChannelUserPermissions = async (
  userId: number
): Promise<TChannelUserPermissionsMap> => {
  const [roleIds, allChannels, dmChannelIds] = await Promise.all([
    getUserRoleIds(userId),
    db.select().from(channels),
    getDirectMessageChannelIdsForUser(userId)
  ]);
  const ownDmChannelIds = new Set(dmChannelIds);

  const userPermissions = await db
    .select({
      channelId: channelUserPermissions.channelId,
      permission: channelUserPermissions.permission,
      allow: channelUserPermissions.allow
    })
    .from(channelUserPermissions)
    .where(eq(channelUserPermissions.userId, userId));

  let rolePermissions: typeof userPermissions = [];

  if (roleIds.length > 0) {
    rolePermissions = await db
      .select({
        channelId: channelRolePermissions.channelId,
        permission: channelRolePermissions.permission,
        allow: channelRolePermissions.allow
      })
      .from(channelRolePermissions)
      .where(inArray(channelRolePermissions.roleId, roleIds));
  }

  const userPermMap = new Map<number, Map<ChannelPermission, boolean>>();

  for (const perm of userPermissions) {
    if (!userPermMap.has(perm.channelId)) {
      userPermMap.set(perm.channelId, new Map());
    }

    userPermMap
      .get(perm.channelId)!
      .set(perm.permission as ChannelPermission, perm.allow);
  }

  const rolePermMap = new Map<number, Map<ChannelPermission, boolean>>();

  for (const perm of rolePermissions) {
    if (!rolePermMap.has(perm.channelId)) {
      rolePermMap.set(perm.channelId, new Map());
    }

    const channelMap = rolePermMap.get(perm.channelId)!;
    const existing = channelMap.get(perm.permission as ChannelPermission);

    channelMap.set(
      perm.permission as ChannelPermission,
      existing || perm.allow
    );
  }

  const allPermissionTypes = Object.values(ChannelPermission);

  const channelPermissions: Record<
    number,
    { channelId: number; permissions: Record<ChannelPermission, boolean> }
  > = {};

  for (const channel of allChannels) {
    // another pair's DM gets no entry: even its id is not the user's to see
    if (channel.isDm && !ownDmChannelIds.has(channel.id)) continue;

    const permissions: Record<string, boolean> = {};

    for (const permissionType of allPermissionTypes) {
      const userPerm = userPermMap.get(channel.id)?.get(permissionType);

      if (userPerm !== undefined) {
        permissions[permissionType] = userPerm;

        continue;
      }

      const rolePerm = rolePermMap.get(channel.id)?.get(permissionType);

      if (rolePerm !== undefined) {
        permissions[permissionType] = rolePerm;

        continue;
      }

      permissions[permissionType] = false;
    }

    // DMs have no granular permissions: a participant holds all of them
    if (channel.isDm) {
      for (const permissionType of allPermissionTypes) {
        permissions[permissionType] = true;
      }
    }

    channelPermissions[channel.id] = {
      channelId: channel.id,
      permissions: permissions as Record<ChannelPermission, boolean>
    };
  }

  return channelPermissions;
};

type TAudienceOptions = {
  forceAllUsers?: boolean;
  permission?: ChannelPermission;
};

// Who a channel's events reach: every user, or an explicit id list.
// "everyone" stays symbolic so the online variant can answer it from the
// socket list instead of scanning the users table on every typing event.
const getChannelAudience = async (
  channelId: number,
  options?: TAudienceOptions
): Promise<'everyone' | number[]> => {
  const channel = await db
    .select({ isDm: channels.isDm, private: channels.private })
    .from(channels)
    .where(eq(channels.id, channelId))
    .get();

  if (!channel) return [];

  if (channel.isDm) return getDirectMessageChannelParticipantIds(channelId);

  if (!channel.private || options?.forceAllUsers) return 'everyone';

  // Without a permission, any override row counts, deny included: callers
  // asking for members want everyone the channel was configured for.
  const permission = options?.permission;
  const granted = (
    table: typeof channelUserPermissions | typeof channelRolePermissions
  ) =>
    permission
      ? sql`AND ${table.permission} = ${permission} AND ${table.allow} = 1`
      : sql``;

  // direct overrides, members of granted roles, and owners (who see all)
  const rows = await db.all<{ userId: number }>(sql`
    SELECT ${channelUserPermissions.userId} AS userId
      FROM ${channelUserPermissions}
      WHERE ${channelUserPermissions.channelId} = ${channelId}
        ${granted(channelUserPermissions)}
    UNION
    SELECT ${userRoles.userId} FROM ${userRoles}
      WHERE ${userRoles.roleId} IN (
        SELECT ${channelRolePermissions.roleId} FROM ${channelRolePermissions}
          WHERE ${channelRolePermissions.channelId} = ${channelId}
            ${granted(channelRolePermissions)})
        OR ${userRoles.roleId} = ${OWNER_ROLE_ID}
    ORDER BY 1`);

  return rows.map((row) => row.userId);
};

const getAffectedUserIdsForChannel = async (
  channelId: number,
  options?: TAudienceOptions
): Promise<number[]> => {
  const audience = await getChannelAudience(channelId, options);

  return audience === 'everyone' ? getAllUserIds() : audience;
};

// Runs per published message and typing event. An online socket implies an
// existing user, so "everyone" needs no table scan.
const getAffectedOnlineUserIdsForChannel = async (
  channelId: number,
  options?: TAudienceOptions
): Promise<number[]> => {
  const audience = await getChannelAudience(channelId, options);
  const onlineUserIds = getOnlineUserIds();

  if (audience === 'everyone') return onlineUserIds;

  const online = new Set(onlineUserIds);

  return audience.filter((userId) => online.has(userId));
};

// Unread counts for channels the caller has already cleared for this user:
// a count for a private channel (or another pair's DM) would reveal its
// activity to a non-member. Channels without any message get no entry.
//
// Three read states, and they must stay distinguishable. A live pointer
// counts by id. A row whose pointer was nulled by ON DELETE SET NULL (the
// read message was deleted or expired) falls back to lastReadAt, otherwise
// losing the pointer would resurrect the whole channel as unread. No row
// means never opened, so everything counts. Each case is its own count so
// it stays an index range over the unread tail, (channel_id, id) or
// (channel_id, created_at), instead of a scan of the channel's history.
const getUnreadCounts = async (
  userId: number,
  channelIds: number[]
): Promise<TReadStateMap> => {
  if (channelIds.length === 0) return {};

  const unread = (range?: SQL) => sql<number>`(
    SELECT COUNT(*) FROM ${messages}
    WHERE ${messages.channelId} = ${channels.id}
      AND ${messages.userId} != ${userId}
      ${range ? sql`AND ${range}` : sql``}
  )`;

  const results = await db
    .select({
      channelId: channels.id,
      unreadCount: sql<number>`CASE
        WHEN ${channelReadStates.lastReadMessageId} IS NOT NULL
          THEN ${unread(sql`${messages.id} > ${channelReadStates.lastReadMessageId}`)}
        WHEN ${channelReadStates.lastReadAt} IS NOT NULL
          THEN ${unread(sql`${messages.createdAt} > ${channelReadStates.lastReadAt}`)}
        ELSE ${unread()}
      END`
    })
    .from(channels)
    .leftJoin(
      channelReadStates,
      and(
        eq(channelReadStates.channelId, channels.id),
        eq(channelReadStates.userId, userId)
      )
    )
    .where(
      and(
        inArray(channels.id, channelIds),
        exists(
          db
            .select({ id: messages.id })
            .from(messages)
            .where(eq(messages.channelId, channels.id))
        )
      )
    );

  const readStateMap: TReadStateMap = {};

  for (const result of results) {
    readStateMap[result.channelId] = result.unreadCount;
  }

  return readStateMap;
};

const getChannelsReadStatesForUser = async (
  userId: number
): Promise<TReadStateMap> => {
  const accessibleIds = (await getChannelsForUser(userId)).map((c) => c.id);

  return getUnreadCounts(userId, accessibleIds);
};

// Fetch a channel row by id or throw NOT_FOUND. Use only when the
// caller wants the full row; for partial selects, write the query
// directly so the projection stays visible at the call site.
const getChannelByIdOrThrow = async (channelId: number): Promise<TChannel> => {
  const channel = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .get();

  invariant(channel, {
    code: 'NOT_FOUND',
    message: 'Channel not found'
  });

  return channel;
};

export {
  getAffectedOnlineUserIdsForChannel,
  getAffectedUserIdsForChannel,
  getAllChannelUserPermissions,
  getChannelByIdOrThrow,
  getChannelsForUser,
  getChannelsReadStatesForUser,
  getUnreadCounts
};
