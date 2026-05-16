import { ActivityLogType, Permission } from '@caesar/shared';
import { db } from '@server/db';
import { removeFile } from '@server/db/mutations/files';
import { publishEmoji } from '@server/db/publishers';
import { emojis } from '@server/db/schema';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const deleteEmojiRoute = protectedProcedure
  .input(
    z.object({
      emojiId: z.number()
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_EMOJIS);

    const removedEmoji = await db
      .delete(emojis)
      .where(eq(emojis.id, input.emojiId))
      .returning()
      .get();

    invariant(removedEmoji, {
      code: 'NOT_FOUND',
      message: 'Emoji not found'
    });

    await removeFile(removedEmoji.fileId);

    publishEmoji(removedEmoji.id, 'delete');
    enqueueActivityLog({
      type: ActivityLogType.DELETED_EMOJI,
      userId: ctx.user.id,
      details: {
        name: removedEmoji.name
      }
    });
  });

export { deleteEmojiRoute };
