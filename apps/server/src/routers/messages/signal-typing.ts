import { ChannelPermission, Permission, ServerEvents } from '@caesar/shared';
import { config } from '@server/config';
import { getAffectedOnlineUserIdsForChannel } from '@server/db/queries/channels';
import { assertChannelAccess } from '@server/helpers/assert-channel-access';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { isAppearingOffline } from '@server/utils/wss';
import { z } from 'zod';

const signalTypingRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.signalTyping.maxRequests,
  windowMs: config.rateLimiters.signalTyping.windowMs,
  logLabel: 'signalTyping'
})
  .input(
    z.object({
      channelId: z.number()
    })
  )
  .mutation(async ({ input, ctx }) => {
    const [, channel] = await Promise.all([
      ctx.needsPermission(Permission.SEND_MESSAGES),
      assertChannelAccess(ctx, input.channelId, ChannelPermission.SEND_MESSAGES)
    ]);
    const affectedUserIds = await getAffectedOnlineUserIdsForChannel(
      input.channelId,
      { permission: ChannelPermission.VIEW_CHANNEL, channel }
    );

    // appear-offline users don't leak presence via the typing channel.
    // Permission checks above still run so this can't be used to probe.
    if (isAppearingOffline(ctx.userId)) return;

    ctx.pubsub.publishFor(affectedUserIds, ServerEvents.MESSAGE_TYPING, {
      channelId: input.channelId,
      userId: ctx.userId
    });
  });

export { signalTypingRoute };
