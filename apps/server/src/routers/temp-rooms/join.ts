import { Permission } from '@caesar/shared';
import { config } from '@server/config';
import { logger } from '@server/logger';
import {
  addTempRoomParticipant,
  findTempRoomByToken,
  isTempRoomFull
} from '@server/runtimes/temp-rooms';
import { VoiceRuntime } from '@server/runtimes/voice';
import { markVoiceSocket } from '@server/runtimes/voice-access';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { z } from 'zod';
import { getJoinedTempRoom, ROOM_NOT_FOUND } from './access';

const zTempRoomJoin = z.object({
  token: z.string().min(1).max(128),
  state: z.object({
    micMuted: z.boolean().default(false),
    soundMuted: z.boolean().default(false)
  })
});

// A member entering a room by its link. From here on it is an ordinary
// voice call for them: the voice.* procedures take over.
const joinTempRoomRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.joinTempRoom.maxRequests,
  windowMs: config.rateLimiters.joinTempRoom.windowMs,
  logLabel: 'joinTempRoom'
})
  .input(zTempRoomJoin)
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.JOIN_VOICE_CHANNELS);

    const room = findTempRoomByToken(input.token);

    invariant(room, ROOM_NOT_FOUND);

    invariant(!VoiceRuntime.findRuntimeByUserId(ctx.userId), {
      code: 'BAD_REQUEST',
      message: 'User already in a voice channel'
    });

    invariant(!isTempRoomFull(room), {
      code: 'PRECONDITION_FAILED',
      message: 'This room is full'
    });

    const runtime = addTempRoomParticipant(
      room,
      ctx.userId,
      { name: ctx.user.name, isGuest: false },
      input.state
    );

    invariant(runtime, ROOM_NOT_FOUND);

    ctx.currentVoiceChannelId = room.id;

    const ws = ctx.getOwnWs();

    if (ws) markVoiceSocket(ctx.userId, ws);

    logger.info('%s joined temp room %d', ctx.user.name, room.id);

    return getJoinedTempRoom(room, runtime);
  });

export { joinTempRoomRoute, zTempRoomJoin };
