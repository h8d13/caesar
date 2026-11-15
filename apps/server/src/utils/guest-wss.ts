import { UserStatus, type ChannelPermission, type TUser } from '@caesar/shared';
import { TRPCError } from '@trpc/server';
import {
  applyWSSHandler,
  type CreateWSSContextFnOptions
} from '@trpc/server/adapters/ws';
import { type WebSocket, WebSocketServer } from 'ws';
import { closeSocket } from '../helpers/close-reason';
import { getWsInfo } from '../helpers/get-ws-info';
import { isCrossOrigin } from '../helpers/session-token';
import { logger } from '../logger';
import { guestRouter } from '../routers/guest';
import {
  allocateGuestId,
  getTempRoomPermissions
} from '../runtimes/temp-rooms';
import { VoiceRuntime } from '../runtimes/voice';
import { removeFromVoice } from '../runtimes/voice-access';
import type { TConnectionInfo } from '../types';
import { invariant } from './invariant';
import { pubsub } from './pubsub';
import type { Context } from './trpc';

// The WebSocket endpoint for people without an account (temp rooms). It is
// a separate server with its own router (routers/guest.ts) and its own
// context: no session, no user row, no roles. A guest is a negative id that
// lives as long as the socket and can be in one temp room.

// unauthenticated sockets cost memory and a keepalive each: bound them
const MAX_GUEST_SOCKETS = 200;
const MAX_GUEST_SOCKETS_PER_IP = 8;
// a guest socket has no purpose outside a room: one that is not in one for
// a whole tick (never joined, left, was removed) is closed
const IDLE_CHECK_MS = 30_000;

const guestContexts = new WeakMap<WebSocket, Context>();
const socketsByIp = new Map<string, number>();

// What the shared voice procedures read from ctx.user. Nothing here is ever
// stored or sent: a guest reaches others only as { id, name } in the room's
// participant list.
const createGuestUser = (id: number): TUser => ({
  id,
  identity: '',
  password: '',
  name: 'Guest',
  avatarId: null,
  bannerId: null,
  bio: null,
  banned: false,
  banReason: null,
  bannedAt: null,
  bannerColor: null,
  birthday: null,
  appearOffline: false,
  allowMultipleSessions: false,
  sendDmReadReceipts: false,
  lastLoginAt: 0,
  sessionEpoch: 0,
  socialCredit: 0,
  invitedBy: null,
  createdAt: Date.now(),
  updatedAt: null
});

const createGuestContext = async ({
  req,
  res
}: CreateWSSContextFnOptions): Promise<Context> => {
  const ws = res as WebSocket | undefined;
  const user = createGuestUser(allocateGuestId());

  let connectionInfo: TConnectionInfo | undefined;

  // No roles: a guest holds no server permission, ever.
  const hasPermission = async () => false;

  const needsPermission = async () => {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Insufficient permissions'
    });
  };

  // Channels do not exist for a guest: only the temp room they are in
  // grants anything.
  const getChannelPermissions = async (channelId: number) =>
    getTempRoomPermissions(channelId, user.id);

  const hasChannelPermission = async (
    channelId: number,
    targetPermission: ChannelPermission
  ) => getTempRoomPermissions(channelId, user.id)[targetPermission];

  const needsChannelPermission = async (
    channelId: number,
    targetPermission: ChannelPermission
  ) => {
    invariant(getTempRoomPermissions(channelId, user.id)[targetPermission], {
      code: 'FORBIDDEN',
      message: 'Insufficient channel permissions'
    });
  };

  const ctx: Context = {
    pubsub,
    token: '',
    user,
    // set by tempRooms.joinAsGuest once a valid room link was presented
    authenticated: false,
    userId: user.id,
    handshakeHash: '',
    currentVoiceChannelId: undefined,
    hasPermission,
    needsPermission,
    getChannelPermissions,
    hasChannelPermission,
    needsChannelPermission,
    getOwnWs: () => ws,
    getStatusById: () => UserStatus.OFFLINE,
    setWsUserId: () => {},
    getUserWsList: () => [],
    getConnectionInfo: () => (connectionInfo ??= getWsInfo(ws, req)),
    throwValidationError: (field, message) => {
      // this mimics the zod validation error format
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: JSON.stringify([{ code: 'custom', path: [field], message }])
      });
    },
    saveUserIp: () => {}
  };

  if (ws) guestContexts.set(ws, ctx);

  return ctx;
};

const isInRoom = (ctx: Context | undefined) =>
  !!ctx && !!VoiceRuntime.findRuntimeByUserId(ctx.userId);

const createGuestWsServer = () => {
  const guestWss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    // signalling only (transport and RTP parameters)
    maxPayload: 256 * 1024
  });

  guestWss.on('connection', (ws, req) => {
    // same rule as the main socket, though there is no cookie to ride here:
    // another site must not put its visitors into a room from their browser
    if (isCrossOrigin(req)) {
      closeSocket(ws, 1008, 'Forbidden origin');
      return;
    }

    const ip = getWsInfo(ws, req)?.ip ?? 'unknown';
    const fromIp = socketsByIp.get(ip) ?? 0;

    if (
      guestWss.clients.size > MAX_GUEST_SOCKETS ||
      fromIp >= MAX_GUEST_SOCKETS_PER_IP
    ) {
      closeSocket(ws, 1013, 'Too many guest connections');
      return;
    }

    socketsByIp.set(ip, fromIp + 1);

    const idleTimer = setInterval(() => {
      if (!isInRoom(guestContexts.get(ws))) {
        closeSocket(ws, 1000, 'Not in a room');
      }
    }, IDLE_CHECK_MS);

    ws.on('close', async () => {
      clearInterval(idleTimer);

      const left = (socketsByIp.get(ip) ?? 1) - 1;

      if (left > 0) socketsByIp.set(ip, left);
      else socketsByIp.delete(ip);

      const ctx = guestContexts.get(ws);
      const runtime = ctx && VoiceRuntime.findRuntimeByUserId(ctx.userId);

      if (!runtime) return;

      try {
        await removeFromVoice(runtime, ctx.userId);
      } catch (error) {
        logger.error('[Guest] failed to remove a guest from voice:', error);
      }
    });

    ws.on('error', (err) => {
      logger.error('Guest WebSocket client error:', err);
    });
  });

  guestWss.on('error', (err) => {
    logger.error('Guest WebSocket server error:', err);
  });

  applyWSSHandler({
    wss: guestWss,
    router: guestRouter,
    createContext: createGuestContext,
    onError: ({ error, path, type }) => {
      if (error.code !== 'INTERNAL_SERVER_ERROR') return;

      logger.error(
        `[tRPC guest] ${type} ${path ?? '<no path>'} failed:`,
        error
      );
    },
    keepAlive: {
      enabled: true,
      pingMs: 30_000,
      pongWaitMs: 5_000
    }
  });

  return guestWss;
};

export { createGuestContext, createGuestWsServer };
