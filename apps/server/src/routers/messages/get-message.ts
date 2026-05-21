import { getMessage } from '@server/db/queries/messages';
import { assertChannelAccess } from '@server/helpers/assert-channel-access';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { z } from 'zod';

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

    await assertChannelAccess(ctx, message.channelId);

    return message;
  });

export { getMessageRoute };
