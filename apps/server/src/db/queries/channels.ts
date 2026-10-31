import {
  ChannelPermission,
  OWNER_ROLE_ID,
  UNREAD_COUNT_MAX,
  type TChannel,
  type TChannelAccess,
  type TChannelPermissionsMap,
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
import { prepared } from '../prepared';
import {
  getDirectMessageChannelIdsForUser,
  getDirectMessageChannelParticipantIds
} from './dms';
import { getUserRoleIds, userRoleIdsSelect } from './roles';
import { getAllUserIds } from './users';

const allPermissionTypes = Object.values(ChannelPermission);

const allChannelsQuery = prepared(() => db.select().from(channels));

const channelAccessRowQuery = prepared(() =>
  db
    .select({
      private: channels.private,
      isDm: channels.isDm,
      fileAccessToken: channels.fileAccessToken
    })
    .from(channels)
    .where(eq(channels.id, sql.placeholder('channelId')))
    .limit(1)
);

// The columns every channel access check reads (TChannelAccess), the hint
// the permission checks accept in place of their own read.
const getChannelAccessRow = (channelId: number) =>
  channelAccessRowQuery().get({ channelId });

// a user's override and role-grant rows: every channel, or one
const overridesQuery = (oneChannel: boolean) =>
  prepared(() =>
    db
      .select({
        channelId: channelUserPermissions.channelId,
        permission: channelUserPermissions.permission,
        allow: channelUserPermissions.allow
      })
      .from(channelUserPermissions)
      .where(
        and(
          eq(channelUserPermissions.userId, sql.placeholder('userId')),
          oneChannel
            ? eq(channelUserPermissions.channelId, sql.placeholder('channelId'))
            : undefined
        )
      )
  );

const grantsQuery = (oneChannel: boolean) =>
  prepared(() =>
    db
      .select({
        channelId: channelRolePermissions.channelId,
        permission: channelRolePermissions.permission,
        allow: channelRolePermissions.allow
      })
      .from(channelRolePermissions)
      .where(
        and(
          inArray(channelRolePermissions.roleId, userRoleIdsSelect()),
          oneChannel
            ? eq(channelRolePermissions.channelId, sql.placeholder('channelId'))
            : undefined
        )
      )
  );

const userOverridesQuery = overridesQuery(false);
const userGrantsQuery = grantsQuery(false);
const channelOverridesQuery = overridesQuery(true);
const channelGrantsQuery = grantsQuery(true);

type TPermissionRow = { channelId: number; permission: string; allow: boolean };
type TPermissionMap = Map<string, boolean>;

// an override is one row; roles grant if any of them allows
const setOverride = (map: TPermissionMap, row: TPermissionRow) =>
  map.set(row.permission, row.allow);
const addGrant = (map: TPermissionMap, row: TPermissionRow) =>
  map.set(row.permission, map.get(row.permission) || row.allow);

const byChannel = (rows: TPermissionRow[], add: typeof setOverride) => {
  const maps = new Map<number, TPermissionMap>();

  for (const row of rows) {
    let map = maps.get(row.channelId);

    if (!map) maps.set(row.channelId, (map = new Map()));

    add(map, row);
  }

  return maps;
};

// The one resolution rule: a user override beats any role, roles beat the
// default deny.
const resolvePermissions = (
  overrides?: TPermissionMap,
  grants?: TPermissionMap
) => {
  const resolved = {} as TChannelPermissionsMap;

  for (const type of allPermissionTypes) {
    resolved[type] = overrides?.get(type) ?? grants?.get(type) ?? false;
  }

  return resolved;
};

// shared by every check: frozen so no caller can alter another's answer
const uniform = (allow: boolean) =>
  Object.freeze(
    Object.fromEntries(allPermissionTypes.map((type) => [type, allow]))
  ) as TChannelPermissionsMap;
const ALL_PERMISSIONS = uniform(true);
const NO_PERMISSIONS = uniform(false);

// One read of a user's channel inputs, deriving both the visible channel
// list and the per-channel permission map: visibility is VIEW_CHANNEL of
// the same resolution.
const getChannelAccess = async (userId: number) => {
  const [roleIds, allChannels, dmChannelIds, overrideRows, grantRows] =
    await Promise.all([
      getUserRoleIds(userId),
      allChannelsQuery().all(),
      getDirectMessageChannelIdsForUser(userId),
      userOverridesQuery().all({ userId }),
      userGrantsQuery().all({ userId })
    ]);
  const ownDmChannelIds = new Set(dmChannelIds);
  const isOwner = roleIds.includes(OWNER_ROLE_ID);
  const overrides = byChannel(overrideRows, setOverride);
  const grants = byChannel(grantRows, addGrant);
  const visible: TChannel[] = [];
  const permissions: TChannelUserPermissionsMap = {};

  for (const channel of allChannels) {
    // another pair's DM gets no entry: even its id is not the user's to see
    if (channel.isDm && !ownDmChannelIds.has(channel.id)) continue;

    // DMs have no granular permissions: a participant holds all of them
    const resolved = channel.isDm
      ? ALL_PERMISSIONS
      : resolvePermissions(overrides.get(channel.id), grants.get(channel.id));

    permissions[channel.id] = { channelId: channel.id, permissions: resolved };

    if (
      isOwner ||
      !channel.private ||
      resolved[ChannelPermission.VIEW_CHANNEL]
    ) {
      visible.push(channel);
    }
  }

  return { channels: visible, permissions };
};

// One user's permissions in one non-DM channel, by the same rule as
// getChannelAccess but without resolving every other channel: the hot path
// for each action in a private channel.
const getChannelPermissionsForUser = async (
  userId: number,
  channelId: number
) => {
  const [overrideRows, grantRows] = await Promise.all([
    channelOverridesQuery().all({ userId, channelId }),
    channelGrantsQuery().all({ userId, channelId })
  ]);

  return resolvePermissions(
    byChannel(overrideRows, setOverride).get(channelId),
    byChannel(grantRows, addGrant).get(channelId)
  );
};

type TAudienceOptions = {
  forceAllUsers?: boolean;
  permission?: ChannelPermission;
  // callers that already read the row (send, typing, push) skip the lookup
  channel?: Pick<TChannelAccess, 'isDm' | 'private'>;
};

// Who a channel's events reach: every user, or an explicit id list.
// "everyone" stays symbolic so the online variant can answer it from the
// socket list instead of scanning the users table on every typing event.
const getChannelAudience = async (
  channelId: number,
  options?: TAudienceOptions
): Promise<'everyone' | number[]> => {
  const channel = options?.channel ?? (await getChannelAccessRow(channelId));

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

  // an uncapped count walked a never-read channel's whole history (a row
  // lookup per message for the user_id filter) on every join
  const unread = (range?: SQL) => sql<number>`(
    SELECT COUNT(*) FROM (
      SELECT 1 FROM ${messages}
      WHERE ${messages.channelId} = ${channels.id}
        AND ${messages.userId} != ${userId}
        ${range ? sql`AND ${range}` : sql``}
      LIMIT ${UNREAD_COUNT_MAX + 1}
    )
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
  const accessibleIds = (await getChannelAccess(userId)).channels.map(
    (c) => c.id
  );

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
  ALL_PERMISSIONS,
  allPermissionTypes,
  getAffectedOnlineUserIdsForChannel,
  getAffectedUserIdsForChannel,
  getChannelAccess,
  getChannelAccessRow,
  getChannelAudience,
  getChannelByIdOrThrow,
  getChannelPermissionsForUser,
  getChannelsReadStatesForUser,
  getUnreadCounts,
  NO_PERMISSIONS
};
