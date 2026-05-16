import { ActivityLogType, ChannelType, Permission } from '@caesar/shared';
import { randomUUIDv7 } from 'bun';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@server/db';
import { publishChannel } from '@server/db/publishers';
import { channels } from '@server/db/schema';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { VoiceRuntime } from '@server/runtimes/voice';
import { protectedProcedure } from '@server/utils/trpc';

const addChannelRoute = protectedProcedure
  .input(
    z.object({
      type: z.enum(ChannelType),
      name: z.string().min(1).max(27),
      categoryId: z.number()
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_CHANNELS);

    const channel = await db.transaction(async (tx) => {
      const maxPositionChannel = await tx
        .select()
        .from(channels)
        .orderBy(desc(channels.position))
        .where(eq(channels.categoryId, input.categoryId))
        .limit(1)
        .get();

      const now = Date.now();

      const newChannel = await tx
        .insert(channels)
        .values({
          position:
            maxPositionChannel?.position !== undefined
              ? maxPositionChannel.position + 1
              : 0,
          name: input.name,
          type: input.type,
          fileAccessToken: randomUUIDv7(),
          fileAccessTokenUpdatedAt: now,
          categoryId: input.categoryId,
          createdAt: now
        })
        .returning()
        .get();

      return newChannel;
    });

    if (channel.type === ChannelType.VOICE) {
      const runtime = new VoiceRuntime(channel.id);

      await runtime.init();
    }

    publishChannel(channel.id, 'create');
    enqueueActivityLog({
      type: ActivityLogType.CREATED_CHANNEL,
      userId: ctx.user.id,
      details: {
        channelId: channel.id,
        channelName: channel.name,
        type: channel.type as ChannelType
      }
    });

    return channel.id;
  });

export { addChannelRoute };
