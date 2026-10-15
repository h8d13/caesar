import { messages } from '@caesar/shared/db/schema';
import { getJoinedMessages } from '@server/db/queries/messages';
import { assertChannelAccess } from '@server/helpers/assert-channel-access';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { and, desc, eq } from 'drizzle-orm';
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
      where: and(
        eq(messages.channelId, input.channelId),
        eq(messages.pinned, true)
      ),
      orderBy: desc(messages.createdAt)
    });
  });

export { getPinnedRoute };
