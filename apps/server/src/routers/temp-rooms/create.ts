import { Permission, TEMP_ROOM_NAME_MAX_LENGTH } from '@caesar/shared';
import { config } from '@server/config';
import { logger } from '@server/logger';
import { createTempRoom, toPublicTempRoom } from '@server/runtimes/temp-rooms';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { z } from 'zod';

const createTempRoomRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.createTempRoom.maxRequests,
  windowMs: config.rateLimiters.createTempRoom.windowMs,
  logLabel: 'createTempRoom'
})
  .input(
    z.object({
      name: z.string().trim().max(TEMP_ROOM_NAME_MAX_LENGTH).optional(),
      // off: a members-only room, the link refuses anyone not signed in
      guestsAllowed: z.boolean().default(true)
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.CREATE_TEMP_ROOMS);

    const room = await createTempRoom(
      ctx.userId,
      input.name || `${ctx.user.name}'s room`,
      input.guestsAllowed
    );

    invariant(room !== 'limit', {
      code: 'PRECONDITION_FAILED',
      message: 'Too many temp rooms are open. Close one first.'
    });

    logger.info('%s opened temp room %d', ctx.user.name, room.id);

    return { ...toPublicTempRoom(room), token: room.token };
  });

export { createTempRoomRoute };
