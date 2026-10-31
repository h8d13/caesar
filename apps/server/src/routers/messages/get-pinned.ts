import { getJoinedMessages } from '@server/db/queries/messages';
import { assertChannelAccess } from '@server/helpers/assert-channel-access';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { z } from 'zod';

const getPinnedRoute = protectedProcedure
  .input(
    z.object({
      channelId: z.number()
    })
  )
  .query(async ({ ctx, input }) => {
    const channel = await assertChannelAccess(ctx, input.channelId);

    invariant(channel, {
      code: 'NOT_FOUND',
      message: 'Channel not found'
    });

    return getJoinedMessages(channel, {
      by: 'pinned',
      channelId: input.channelId
    });
  });

export { getPinnedRoute };
