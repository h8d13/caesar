import { ChannelPermission } from '@caesar/shared';
import { z } from 'zod';
import { assertDmChannel } from '@server/db/queries/dms';
import { getMessage } from '@server/db/queries/messages';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';

const getMessageRoute = protectedProcedure
  .input(
    z.object({
      messageId: z.number()
    })
  )
  .query(async ({ ctx, input }) => {
    const message = await getMessage(input.messageId);

    invariant(message, {
      code: 'NOT_FOUND',
      message: 'Message not found'
    });

    await assertDmChannel(message.channelId, ctx.userId);

    await ctx.needsChannelPermission(
      message.channelId,
      ChannelPermission.VIEW_CHANNEL
    );

    return message;
  });

export { getMessageRoute };
