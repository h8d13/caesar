import {
  ActivityLogType,
  ChannelPermission,
  OWNER_ROLE_ID,
  Permission,
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
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { db } from '../db';
import { getAllChannelUserPermissions } from '../db/queries/channels';
import { isUserDmParticipant } from '../db/queries/dms';
import { getUserById, getUserByToken } from '../db/queries/users';
import { getWsInfo } from '../helpers/get-ws-info';
import { logger } from '../logger';
import { enqueueActivityLog } from '../queues/activity-log';
import { appRouter } from '../routers';
import { getUserRoles } from '../routers/users/get-user-roles';
import { VoiceRuntime } from '../runtimes/voice';
import { invariant } from './invariant';
import { pubsub } from './pubsub';
import type { Context } from './trpc';

// Server-local extension of the ws WebSocket. Replaces the previous
// global `declare module 'ws'` augmentation: keeping it local stops the
// shape leaking into client typecheck through tRPC type inference.
type AuthedWebSocket = WebSocket & { userId?: number; token: string };

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
  req
}: CreateWSSContextFnOptions): Promise<Context> => {
  const { token } = info.connectionParams as TConnectionParams;

  const decodedUser = await getUserByToken(token);

  invariant(decodedUser, {
    code: 'UNAUTHORIZED',
    message: 'Invalid authentication token'
  });

  invariant(!decodedUser.banned, {
    code: 'FORBIDDEN',
    message: 'User is banned'
  });

  const hasPermission = async (targetPermission: Permission | Permission[]) => {
    const user = await getUserById(decodedUser.id);

    if (!user) return false;

    const roles = await getUserRoles(user.id);

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

  const hasChannelPermission = async (
    channelId: number,
    targetPermission: ChannelPermission
  ) => {
    const channel = await db
      .select({
        private: channels.private,
        isDm: channels.isDm
      })
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1)
      .get();

    if (!channel) return false;

    if (channel.isDm) {
      const isParticipant = await isUserDmParticipant(
        channelId,
        decodedUser.id
      );

      if (isParticipant) return true;
    }

    if (!channel.private) return true;

    const user = await getUserById(decodedUser.id);

    if (!user) return false;

    const roles = await getUserRoles(user.id);

    const hasOwnerRole = roles.some((r) => r.id === OWNER_ROLE_ID);

    if (hasOwnerRole) return true; // owner always has all permissions

    const userChannelPermissions = await getAllChannelUserPermissions(
      decodedUser.id
    );

    const channelInfo = userChannelPermissions[channelId];

    if (!channelInfo) return false;
    if (!channelInfo.permissions[ChannelPermission.VIEW_CHANNEL]) return false;

    return channelInfo.permissions[targetPermission] === true;
  };

  const getOwnWs = () => {
    if (!wss) return undefined;
    return Array.from(authedClients()).find((client) => client.token === token);
  };

  const getUserWs = (userId: number) => {
    if (!wss) return undefined;
    return Array.from(authedClients()).find(
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
    if (!wss) return;

    const ws = Array.from(authedClients()).find(
      (client) => client.token === token
    );

    if (ws) {
      ws.userId = userId;
    }
  };

  const getConnectionInfo = () => {
    if (!wss) return getWsInfo(undefined, req);

    const ws = Array.from(authedClients()).find(
      (client) => client.token === token
    );

    if (!ws) return undefined;

    return getWsInfo(ws, req);
  };

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
    targetPermission: ChannelPermission
  ) => {
    invariant(await hasChannelPermission(channelId, targetPermission), {
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

  const saveUserIp = async (userId: number, ip: string) => {
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
    getUserWs,
    getConnectionInfo,
    throwValidationError,
    saveUserIp
  };
};

const createWsServer = async (server: http.Server) => {
  return new Promise<WebSocketServer>((resolve) => {
    // The client uses a single wsLink, so every tRPC query, mutation and
    // subscription rides this socket -- it carries essentially all app
    // bytes. The payloads are near-ideal deflate input: getMessages returns
    // 100 rows of the full messages table (most columns null), and the live
    // events repeat the same key names forever.
    //
    // threshold is deliberately below ws's 1024 default. That default
    // assumes each frame compresses alone; with context takeover (on by
    // default) the shared LZ77 window already holds previous frames, so a
    // 121-byte TYPING event is almost entirely back-references. Measured on
    // a realistic frame mix: history pages 10.1x either way, but live
    // traffic goes 1.0x -> 10.8x by dropping the threshold, at ~52us of
    // deflate per small frame.
    //
    // That per-frame cost is the thing that scales badly: node runs zlib on
    // the libuv threadpool, and a broadcast deflates once per recipient. If
    // this ever serves thousands of concurrent users, raise the threshold
    // (256 keeps ~2.1x on live traffic) or drop context takeover to cap the
    // per-connection zlib window instead.
    wss = new WebSocketServer({
      server,
      perMessageDeflate: {
        threshold: 64,
        concurrencyLimit: 10
      }
    });

    wss.on('connection', (incoming) => {
      const ws = attachSessionFields(incoming);

      ws.once('message', async (message) => {
        try {
          const parsed = JSON.parse(message.toString());
          const { token } = parsed.data as TConnectionParams;

          ws.token = token;
        } catch {
          logger.error('Failed to parse initial WebSocket message');
        }
      });

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
  closeUserSessions,
  createContext,
  createWsServer,
  getOnlineUserIds,
  getUserIp,
  trackUserConnect
};
