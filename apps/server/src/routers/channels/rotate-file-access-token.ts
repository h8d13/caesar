import { ActivityLogType, Permission } from '@caesar/shared';
import { channels } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { getChannelByIdOrThrow } from '@server/db/queries/channels';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { randomUUIDv7 } from 'bun';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const rotateFileAccessTokenRoute = protectedProcedure
  .input(
    z.object({
      channelId: z.number()
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_CHANNELS);

    const channel = await getChannelByIdOrThrow(input.channelId);

    invariant(!channel.isDm, {
      code: 'FORBIDDEN',
      message: 'Cannot rotate file access token for DM channels'
    });

    const newToken = randomUUIDv7();

    await db
      .update(channels)
      .set({
        fileAccessToken: newToken,
        fileAccessTokenUpdatedAt: Date.now()
      })
      .where(eq(channels.id, input.channelId));

    enqueueActivityLog({
      type: ActivityLogType.ROTATE_CHANNEL_FILE_ACCESS_TOKEN,
      userId: ctx.user.id
    });
  });

export { rotateFileAccessTokenRoute };
