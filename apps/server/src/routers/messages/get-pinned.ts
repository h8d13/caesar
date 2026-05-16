import { ChannelPermission } from '@caesar/shared';
import { channels, messages } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { assertDmChannel } from '@server/db/queries/dms';
import { joinMessagesWithRelations } from '@server/db/queries/messages';
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
    await Promise.all([
      assertDmChannel(input.channelId, ctx.userId),
      ctx.needsChannelPermission(
        input.channelId,
        ChannelPermission.VIEW_CHANNEL
      )
    ]);

    const channel = await db
      .select({
        private: channels.private,
        fileAccessToken: channels.fileAccessToken
      })
      .from(channels)
      .where(eq(channels.id, input.channelId))
      .get();

    invariant(channel, {
      code: 'NOT_FOUND',
      message: 'Channel not found'
    });

    const rows = await db
      .select()
      .from(messages)
      .where(
        and(eq(messages.channelId, input.channelId), eq(messages.pinned, true))
      )
      .orderBy(desc(messages.createdAt));

    return joinMessagesWithRelations(rows, channel);
  });

export { getPinnedRoute };
