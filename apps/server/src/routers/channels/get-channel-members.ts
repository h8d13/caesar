import { getAffectedUserIdsForChannel } from '@server/db/queries/channels';
import { assertChannelAccess } from '@server/helpers/assert-channel-access';
import { protectedProcedure } from '@server/utils/trpc';
import { z } from 'zod';

const getChannelMembersRoute = protectedProcedure
  .input(z.object({ channelId: z.number() }))
  .query(async ({ ctx, input }) => {
    // a private channel's member list is only for those who can view it
    const channel = await assertChannelAccess(ctx, input.channelId);

    return getAffectedUserIdsForChannel(input.channelId, { channel });
  });

export { getChannelMembersRoute };
