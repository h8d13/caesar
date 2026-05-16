import { ChannelPermission, Permission, ServerEvents } from '@caesar/shared';
import { config } from '@server/config';
import { getAffectedOnlineUserIdsForChannel } from '@server/db/queries/channels';
import { assertDmChannel } from '@server/db/queries/dms';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { z } from 'zod';

const signalTypingRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.signalTyping.maxRequests,
  windowMs: config.rateLimiters.signalTyping.windowMs,
  logLabel: 'signalTyping'
})
  .input(
    z.object({
      channelId: z.number(),
      parentMessageId: z.number().optional()
    })
  )
  .mutation(async ({ input, ctx }) => {
    const [, , , affectedUserIds] = await Promise.all([
      ctx.needsPermission(Permission.SEND_MESSAGES),
      ctx.needsChannelPermission(
        input.channelId,
        ChannelPermission.SEND_MESSAGES
      ),
      assertDmChannel(input.channelId, ctx.userId),
      getAffectedOnlineUserIdsForChannel(input.channelId, {
        permission: ChannelPermission.VIEW_CHANNEL
      })
    ]);

    ctx.pubsub.publishFor(affectedUserIds, ServerEvents.MESSAGE_TYPING, {
      channelId: input.channelId,
      userId: ctx.userId,
      parentMessageId: input.parentMessageId
    });
  });

export { signalTypingRoute };
