import { Permission } from '@caesar/shared';
import { channels } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const getChannelRoute = protectedProcedure
  .input(
    z.object({
      channelId: z.number().min(1)
    })
  )
  .query(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_CHANNELS);

    const channel = await db
      .select()
      .from(channels)
      .where(eq(channels.id, input.channelId))
      .get();

    invariant(channel, {
      code: 'NOT_FOUND',
      message: 'Channel not found'
    });

    return channel;
  });

export { getChannelRoute };
