import { ActivityLogType, Permission } from '@caesar/shared';
import { config } from '@server/config';
import { db } from '@server/db';
import { publishEmoji } from '@server/db/publishers';
import { getUniqueEmojiName } from '@server/db/queries/emojis';
import { emojis } from '@server/db/schema';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { fileManager } from '@server/utils/file-manager';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { z } from 'zod';

const addEmojiRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.addEmoji.maxRequests,
  windowMs: config.rateLimiters.addEmoji.windowMs,
  logLabel: 'addEmoji'
})
  .input(
    z.array(
      z.object({
        fileId: z.string(),
        name: z.string().min(1).max(32)
      })
    )
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_EMOJIS);

    for (const data of input) {
      const newFile = await fileManager.saveFile(data.fileId, ctx.userId);
      const uniqueEmojiName = await getUniqueEmojiName(data.name);

      const emoji = db
        .insert(emojis)
        .values({
          name: uniqueEmojiName,
          fileId: newFile.id,
          userId: ctx.userId,
          createdAt: Date.now()
        })
        .returning()
        .get();

      publishEmoji(emoji.id, 'create');
      enqueueActivityLog({
        type: ActivityLogType.CREATED_EMOJI,
        userId: ctx.user.id,
        details: {
          name: emoji.name
        }
      });
    }
  });

export { addEmojiRoute };
