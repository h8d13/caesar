import {
  ActivityLogType,
  ChannelPermission,
  OWNER_ROLE_ID,
  type Permission,
  ServerEvents,
  UserStatus,
  type TConnectionParams
} from '@caesar/shared';
import { channels, socialCreditLedger } from '@caesar/shared/db/schema';
import { TRPCError } from '@trpc/server';
import {
  applyWSSHandler,
  type CreateWSSContextFnOptions
} from '@trpc/server/adapters/ws';
import { eq } from 'drizzle-orm';
import type http from 'http';
import { type RawData, WebSocket, WebSocketServer } from 'ws';
import { db } from '../db';
import { getAllChannelUserPermissions } from '../db/queries/channels';
import { isUserDmParticipant } from '../db/queries/dms';
import { getUserById, getUserByToken } from '../db/queries/users';
import { getWsInfo } from '../helpers/get-ws-info';
import {
  getCookie,
  isCrossOrigin,
  SESSION_COOKIE
} from '../helpers/session-token';
import { logger } from '../logger';
import { enqueueActivityLog } from '../queues/activity-log';
import { appRouter } from '../routers';
import { getUserRoles } from '../routers/users/get-user-roles';
import { VoiceRuntime } from '../runtimes/voice';
import type { TConnectionInfo } from '../types';
import { invariant } from './invariant';
import { pubsub } from './pubsub';
import type { Context, TChannelPermissionHints } from './trpc';

// Server-local extension of the ws WebSocket. Replaces the previous
// global `declare module 'ws'` augmentation: keeping it local stops the
// shape leaking into client typecheck through tRPC type inference.
type AuthedWebSocket = WebSocket & { userId?: number; token: string };

// fragmented frames arrive as Buffer[], binaryType 'arraybuffer' as one
const rawDataToString = (data: RawData) =>
  (Array.isArray(data)
    ? Buffer.concat(data)
    : Buffer.isBuffer(data)
      ? data
      : Buffer.from(data)
  ).toString();

// Attach our session fields to a freshly connected WebSocket. Object.assign
// both does the runtime attach and produces the typed intersection, so we
// dont need a separate cast at the call site.
const attachSessionFields = (ws: WebSocket): AuthedWebSocket =>
  Object.assign(ws, {
    userId: undefined as number | undefined,
    token: ''
  });

let wss: WebSocketServer | undefined;

const authedClients = (): Set<AuthedWebSocket> => {
  if (!wss) return new Set();
  return wss.clients as unknown as Set<AuthedWebSocket>;
};

const usersIpMap = new Map<number, string>();
const connectedAt = new Map<number, number>();
const dailyPassiveCredit = new Map<number, { earned: number; day: number }>();

const AUTH_TIMEOUT_MS = 5_000;

// same check tRPC's ws adapter uses to wait for a connectionParams message
const expectsConnectionParams = (req: http.IncomingMessage) =>
  new URL(req.url ?? '/', 'http://localhost').searchParams.get(
    'connectionParams'
  ) === '1';

const PASSIVE_CREDIT_PER_15_MIN = 1;
const PASSIVE_CREDIT_DAILY_CAP = 50;

const trackUserConnect = (userId: number) => {
  connectedAt.set(userId, Date.now());
};

// Close all open WS sessions for a user (except optionally one token). Used
// when a fresh /login bumps sessionEpoch: any prior connections are now on
// a stale epoch and must be told to disconnect.
const closeUserSessions = (
  userId: number,
  reason: string,
  code: number,
  exceptToken?: string
) => {
  if (!wss) return;

  authedClients().forEach((client) => {
    if (client.userId !== userId) return;
    if (exceptToken && client.token === exceptToken) return;

    client.close(code, reason);
  });
};

const getUserIp = (userId: number): string | undefined => {
  return usersIpMap.get(userId);
};

const getOnlineUserIds = (): number[] => {
  if (!wss) return [];

  const userIdSet = new Set<number>();

  authedClients().forEach((client) => {
    if (client.userId) {
      userIdSet.add(client.userId);
    }
  });

  return Array.from(userIdSet);
};

const createContext = async ({
  info,
  req,
  res
}: CreateWSSContextFnOptions): Promise<Context> => {
  // browsers authenticate the upgrade with the HttpOnly session cookie;
  // connectionParams remains for non-browser clients and tests
  const cookieToken = isCrossOrigin(req)
    ? undefined
    : getCookie(req, SESSION_COOKIE);
  const token =
    cookieToken ??
    (info.connectionParams as TConnectionParams | null)?.token ??
    '';

  const decodedUser = await getUserByToken(token);

  invariant(decodedUser, {
    code: 'UNAUTHORIZED',
    message: 'Invalid authentication token'
  });

  // Roles alone decide: a deleted user has none, so the full user row
  // (avatar/banner joins, social credit SUM) is not worth loading per check.
  const hasPermission = async (targetPermission: Permission | Permission[]) => {
    const roles = await getUserRoles(decodedUser.id);

    const hasOwnerRole = roles.some((r) => r.id === OWNER_ROLE_ID);

    if (hasOwnerRole) return true; // owner always has all permissions

    const permissionsSet = new Set<Permission>();

    for (const role of roles) {
      for (const permission of role.permissions) {
        permissionsSet.add(permission);
      }
    }

    if (Array.isArray(targetPermission)) {
      return targetPermission.every((p) => permissionsSet.has(p));
    }

    return permissionsSet.has(targetPermission);
  };

  // 'dm-outsider' is kept apart from 'denied' so needsChannelPermission can
  // name the reason: callers run it in Promise.all next to assertDmChannel,
  // and whichever rejects first must not change the error a client sees.
  const resolveChannelAccess = async (
    channelId: number,
    targetPermission: ChannelPermission,
    // assertChannelAccess passes what it already looked up.
    opts?: TChannelPermissionHints
  ): Promise<'allowed' | 'denied' | 'dm-outsider'> => {
    const channel =
      opts?.channel ??
      (await db
        .select({
          private: channels.private,
          isDm: channels.isDm
        })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1)
        .get());

    if (!channel) return 'denied';

    // DMs are decided by participation alone: the owner bypass below
    // must never reach another pair's conversation.
    if (channel.isDm) {
      const isParticipant =
        opts?.isDmParticipant ??
        (await isUserDmParticipant(channelId, decodedUser.id));

      return isParticipant ? 'allowed' : 'dm-outsider';
    }

    if (!channel.private) return 'allowed';

    const roles = await getUserRoles(decodedUser.id);

    const hasOwnerRole = roles.some((r) => r.id === OWNER_ROLE_ID);

    if (hasOwnerRole) return 'allowed'; // owner always has all permissions

    const userChannelPermissions = await getAllChannelUserPermissions(
      decodedUser.id
    );

    const channelInfo = userChannelPermissions[channelId];

    if (!channelInfo) return 'denied';
    if (!channelInfo.permissions[ChannelPermission.VIEW_CHANNEL])
      return 'denied';

    return channelInfo.permissions[targetPermission] ? 'allowed' : 'denied';
  };

  const hasChannelPermission = async (
    channelId: number,
    targetPermission: ChannelPermission,
    opts?: TChannelPermissionHints
  ) =>
    (await resolveChannelAccess(channelId, targetPermission, opts)) ===
    'allowed';

  // tRPC passes the connection's own socket; a token lookup scanned every
  // client and could match another tab sharing the token.
  const ownWs = wss ? (res as AuthedWebSocket) : undefined;

  const getOwnWs = () => ownWs;

  // every socket of the user: multiple sessions/tabs are allowed, so kick,
  // ban and delete must close them all
  const getUserWsList = (userId: number) => {
    if (!wss) return [];
    return Array.from(authedClients()).filter(
      (client) => client.userId === userId
    );
  };

  const getStatusById = (userId: number) => {
    if (!wss) return UserStatus.OFFLINE;

    const isConnected = Array.from(authedClients()).some(
      (ws) => ws.userId === userId
    );

    return isConnected ? UserStatus.ONLINE : UserStatus.OFFLINE;
  };

  const setWsUserId = (userId: number) => {
    if (ownWs) ownWs.userId = userId;
  };

  // fixed per connection, parsed once instead of per rate-limited call
  let connectionInfo: TConnectionInfo | undefined;

  const getConnectionInfo = () => (connectionInfo ??= getWsInfo(ownWs, req));

  const needsPermission = async (
    targetPermission: Permission | Permission[]
  ) => {
    invariant(await hasPermission(targetPermission), {
      code: 'FORBIDDEN',
      message: 'Insufficient permissions'
    });
  };

  const needsChannelPermission = async (
    channelId: number,
    targetPermission: ChannelPermission,
    opts?: TChannelPermissionHints
  ) => {
    const access = await resolveChannelAccess(
      channelId,
      targetPermission,
      opts
    );

    invariant(access !== 'dm-outsider', {
      code: 'FORBIDDEN',
      message: 'You are not a participant in this DM channel'
    });

    invariant(access === 'allowed', {
      code: 'FORBIDDEN',
      message: 'Insufficient channel permissions'
    });
  };

  const throwValidationError = (field: string, message: string) => {
    // this mimics the zod validation error format
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: JSON.stringify([
        {
          code: 'custom',
          path: [field],
          message
        }
      ])
    });
  };

  const saveUserIp = (userId: number, ip: string) => {
    usersIpMap.set(userId, ip);
  };

  return {
    pubsub,
    token,
    user: decodedUser,
    authenticated: false,
    userId: decodedUser.id,
    handshakeHash: '',
    currentVoiceChannelId: undefined,
    hasPermission,
    needsPermission,
    hasChannelPermission,
    needsChannelPermission,
    getOwnWs,
    getStatusById,
    setWsUserId,
    getUserWsList,
    getConnectionInfo,
    throwValidationError,
    saveUserIp
  };
};

const createWsServer = async (server: http.Server) => {
  return new Promise<WebSocketServer>((resolve) => {
    // The client uses a single wsLink, so every tRPC call rides this socket.
    // No permessage-deflate: compressing every broadcast per recipient
    // capped a 200-user room at ~1.5s send p95 (85ms without).
    wss = new WebSocketServer({
      server,
      perMessageDeflate: false,
      // ws defaults to 100 MiB per frame; uploads go over HTTP, the largest
      // legit frame (a long whiteboard stroke) is well under this
      maxPayload: 4 * 1024 * 1024
    });

    wss.on('connection', (incoming, req) => {
      const ws = attachSessionFields(incoming);

      // cross-site WebSocket hijacking: another site's page can open a
      // socket here and the browser attaches our cookie, so refuse any
      // upgrade whose Origin isn't this host
      if (isCrossOrigin(req)) {
        ws.close(1008, 'Forbidden origin');
        return;
      }

      // tRPC defers createContext to the first message when the URL asks for
      // connectionParams, then accepts or closes; it never times out itself
      if (expectsConnectionParams(req)) {
        const authTimer = setTimeout(
          () => ws.close(1008, 'Authentication timeout'),
          AUTH_TIMEOUT_MS
        );

        ws.once('close', () => clearTimeout(authTimer));
        ws.once('message', () => clearTimeout(authTimer));
      }

      // the token closeUserSessions matches on; non-browser clients send it
      // as connectionParams in their first message instead of a cookie
      const cookieToken = getCookie(req, SESSION_COOKIE);

      if (cookieToken) {
        ws.token = cookieToken;
      } else {
        ws.once('message', async (message) => {
          try {
            const parsed = JSON.parse(rawDataToString(message));
            const { token } = parsed.data as TConnectionParams;

            ws.token = token;
          } catch {
            logger.error('Failed to parse initial WebSocket message');
          }
        });
      }

      ws.on('close', async () => {
        const userId = ws.userId;

        // ignore connections that never authenticated through joinServer
        if (!userId) return;

        // only mark as offline when there are no other active sessions
        const hasOtherSessions = Array.from(authedClients()).some(
          (client) =>
            client !== ws &&
            client.userId === userId &&
            client.readyState === WebSocket.OPEN
        );

        if (hasOtherSessions) return;

        const user = await getUserById(userId);

        if (!user) return;

        // Award passive social credit based on time connected
        const joinTime = connectedAt.get(user.id);
        if (joinTime) {
          const minutes = (Date.now() - joinTime) / 60_000;
          const earned = Math.floor(minutes / 15) * PASSIVE_CREDIT_PER_15_MIN;

          if (earned > 0) {
            const today = Math.floor(Date.now() / 86_400_000);
            const daily = dailyPassiveCredit.get(user.id);
            const todayEarned = daily && daily.day === today ? daily.earned : 0;
            const remaining = PASSIVE_CREDIT_DAILY_CAP - todayEarned;
            const award = Math.min(earned, remaining);

            if (award > 0) {
              await db.insert(socialCreditLedger).values({
                targetId: user.id,
                voterId: null,
                ledgerableType: 'passive',
                ledgerableId: null,
                amount: award,
                createdAt: Date.now()
              });

              dailyPassiveCredit.set(user.id, {
                earned: todayEarned + award,
                day: today
              });
            }
          }

          connectedAt.delete(user.id);
        }

        const voiceRuntime = VoiceRuntime.findRuntimeByUserId(user.id);

        if (voiceRuntime) {
          voiceRuntime.removeUser(user.id);
          const channelState = voiceRuntime.getState();

          pubsub.publish(ServerEvents.USER_LEAVE_VOICE, {
            channelId: voiceRuntime.id,
            userId: user.id
          });
          pubsub.publish(ServerEvents.VOICE_CHANNEL_STATE_UPDATE, {
            channelId: voiceRuntime.id,
            activeSince: channelState.activeSince
          });
        }

        usersIpMap.delete(user.id);
        pubsub.publish(ServerEvents.USER_LEAVE, user.id);

        logger.info('%s left the server', user.name);

        enqueueActivityLog({
          type: ActivityLogType.USER_LEFT,
          userId: user.id
        });
      });

      ws.on('error', (err) => {
        logger.error('WebSocket client error:', err);
      });
    });

    wss.on('close', () => {
      logger.debug('WebSocket server closed');
    });

    wss.on('error', (err) => {
      logger.error('WebSocket server error:', err);
    });

    applyWSSHandler({
      wss,
      router: appRouter,
      createContext,
      // expected errors (auth, validation, permissions) are the client's
      // concern; unexpected ones were otherwise never logged server-side
      onError: ({ error, path, type }) => {
        if (error.code !== 'INTERNAL_SERVER_ERROR') return;

        logger.error(`[tRPC] ${type} ${path ?? '<no path>'} failed:`, error);
      },
      keepAlive: {
        enabled: true,
        pingMs: 30_000,
        pongWaitMs: 5_000
      }
    });

    resolve(wss);
  });
};

export {
  AUTH_TIMEOUT_MS,
  closeUserSessions,
  createContext,
  createWsServer,
  getOnlineUserIds,
  getUserIp,
  trackUserConnect
};
