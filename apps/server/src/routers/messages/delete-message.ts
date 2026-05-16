import { Permission } from '@caesar/shared';
import { messages } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { removeFile } from '@server/db/mutations/files';
import { publishMessage, publishReplyCount } from '@server/db/publishers';
import { assertDmChannel } from '@server/db/queries/dms';
import { getFilesByMessageId } from '@server/db/queries/files';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const deleteMessageRoute = protectedProcedure
  .input(z.object({ messageId: z.number() }))
  .mutation(async ({ input, ctx }) => {
    const targetMessage = await db
      .select({
        userId: messages.userId,
        channelId: messages.channelId,
        parentMessageId: messages.parentMessageId
      })
      .from(messages)
      .where(eq(messages.id, input.messageId))
      .limit(1)
      .get();

    invariant(targetMessage, {
      code: 'NOT_FOUND',
      message: 'Message not found'
    });

    await assertDmChannel(targetMessage.channelId, ctx.userId);

    invariant(
      targetMessage.userId === ctx.user.id ||
        (await ctx.hasPermission(Permission.MANAGE_MESSAGES)),
      {
        code: 'FORBIDDEN',
        message: 'You do not have permission to delete this message'
      }
    );

    const files = await getFilesByMessageId(input.messageId);

    if (files.length > 0) {
      const promises = files.map(async (file) => {
        await removeFile(file.id);
      });

      await Promise.all(promises);
    }

    await db.delete(messages).where(eq(messages.id, input.messageId));

    publishMessage(input.messageId, targetMessage.channelId, 'delete');

    if (targetMessage.parentMessageId) {
      publishReplyCount(targetMessage.parentMessageId, targetMessage.channelId);
    }
  });

export { deleteMessageRoute };
