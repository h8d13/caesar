import { z } from 'zod';
import { getAffectedUserIdsForChannel } from '../../db/queries/channels';
import { ChannelPermission } from '@sharkord/shared';
import { protectedProcedure } from '../../utils/trpc';

const getChannelMembersRoute = protectedProcedure
  .input(z.object({ channelId: z.number() }))
  .query(async ({ input }) => {
    return getAffectedUserIdsForChannel(input.channelId, {
      permission: ChannelPermission.VIEW_CHANNEL
    });
  });

export { getChannelMembersRoute };
