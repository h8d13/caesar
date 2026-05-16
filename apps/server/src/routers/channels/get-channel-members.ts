import { z } from 'zod';
import { getAffectedUserIdsForChannel } from '@server/db/queries/channels';
import { protectedProcedure } from '@server/utils/trpc';

const getChannelMembersRoute = protectedProcedure
  .input(z.object({ channelId: z.number() }))
  .query(async ({ input }) => {
    return getAffectedUserIdsForChannel(input.channelId);
  });

export { getChannelMembersRoute };
