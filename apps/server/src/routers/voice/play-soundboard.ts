import { Permission, ServerEvents } from '@caesar/shared';
import { config } from '@server/config';
import { logger } from '@server/logger';
import {
  createRateLimiter,
  getClientRateLimitKey
} from '@server/utils/rate-limiters/rate-limiter';
import { voiceProcedure } from '@server/utils/voice-procedure';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

const playSoundboardLimiter = createRateLimiter({
  maxRequests: config.rateLimiters.playSoundboard.maxRequests,
  windowMs: config.rateLimiters.playSoundboard.windowMs
});

const playSoundboardRoute = voiceProcedure
  .input(
    z.object({
      soundId: z.number()
    })
  )
  .mutation(async ({ input, ctx }) => {
    const connectionInfo = ctx.getConnectionInfo();

    if (connectionInfo?.ip) {
      const key = getClientRateLimitKey(connectionInfo.ip);
      const rateLimit = playSoundboardLimiter.consume(key);

      if (!rateLimit.allowed) {
        logger.debug(`[RateLimit] playSoundboard blocked key=${key}`);
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many requests. Please try again shortly.'
        });
      }
    }

    await ctx.needsPermission(Permission.USE_SOUNDBOARD);

    ctx.pubsub.publish(ServerEvents.SOUNDBOARD_PLAY, {
      channelId: ctx.voiceChannelId,
      soundId: input.soundId
    });
  });

export { playSoundboardRoute };
