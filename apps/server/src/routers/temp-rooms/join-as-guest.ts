import { GUEST_NAME_MAX_LENGTH } from '@caesar/shared';
import { config } from '@server/config';
import { logger } from '@server/logger';
import {
  addTempRoomParticipant,
  findTempRoomByToken,
  isTempRoomFull
} from '@server/runtimes/temp-rooms';
import { VoiceRuntime } from '@server/runtimes/voice';
import { invariant } from '@server/utils/invariant';
import { publicProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { z } from 'zod';
import { getJoinedTempRoom, ROOM_NOT_FOUND } from './access';
import { zTempRoomJoin } from './join';

// Shown to everyone in the room, so nothing invisible or direction-changing
// survives (control and format characters), and whitespace is collapsed.
const cleanGuestName = (name: string) =>
  name
    .replace(/\p{C}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, GUEST_NAME_MAX_LENGTH);

// The only thing a guest socket can do before it is in a room. The link
// token is the whole credential: it buys entry to that one room, under a
// throwaway id, and the socket's router has nothing but that room's voice
// procedures on it.
const joinTempRoomAsGuestRoute = rateLimitedProcedure(publicProcedure, {
  maxRequests: config.rateLimiters.joinTempRoom.maxRequests,
  windowMs: config.rateLimiters.joinTempRoom.windowMs,
  logLabel: 'joinTempRoomAsGuest'
})
  .input(
    zTempRoomJoin.extend({
      // cut to GUEST_NAME_MAX_LENGTH after cleaning, bounded before it
      name: z
        .string()
        .min(1)
        .max(GUEST_NAME_MAX_LENGTH * 4)
    })
  )
  .mutation(async ({ input, ctx }) => {
    const name = cleanGuestName(input.name);

    if (!name) ctx.throwValidationError('name', 'Enter a name');

    const room = findTempRoomByToken(input.token);
    const ip = ctx.getConnectionInfo()?.ip;

    // a kicked guest gets the same answer as a dead link
    invariant(room && !(ip && room.blockedIps.has(ip)), ROOM_NOT_FOUND);

    invariant(!VoiceRuntime.findRuntimeByUserId(ctx.userId), {
      code: 'BAD_REQUEST',
      message: 'Already in a room'
    });

    invariant(!isTempRoomFull(room), {
      code: 'PRECONDITION_FAILED',
      message: 'This room is full'
    });

    const runtime = addTempRoomParticipant(
      room,
      ctx.userId,
      { name, isGuest: true, ws: ctx.getOwnWs(), ip },
      input.state
    );

    invariant(runtime, ROOM_NOT_FOUND);

    ctx.user.name = name;
    ctx.authenticated = true;
    ctx.currentVoiceChannelId = room.id;

    logger.info(
      'Guest "%s" (%d) joined temp room %d (IP: %s)',
      name,
      ctx.userId,
      room.id,
      ip ?? 'unknown'
    );

    return { ...getJoinedTempRoom(room, runtime), ownId: ctx.userId };
  });

export { joinTempRoomAsGuestRoute };
