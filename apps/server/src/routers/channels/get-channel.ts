import { Permission } from '@caesar/shared';
import { getChannelByIdOrThrow } from '@server/db/queries/channels';
import { protectedProcedure } from '@server/utils/trpc';
import { z } from 'zod';

const getChannelRoute = protectedProcedure
  .input(
    z.object({
      channelId: z.number().min(1)
    })
  )
  .query(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_CHANNELS);

    return getChannelByIdOrThrow(input.channelId);
  });

export { getChannelRoute };
