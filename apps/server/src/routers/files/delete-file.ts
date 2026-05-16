import { isEmptyMessage, Permission } from '@caesar/shared';
import { db } from '@server/db';
import { removeFile } from '@server/db/mutations/files';
import { publishMessage } from '@server/db/publishers';
import { getFilesByMessageId } from '@server/db/queries/files';
import { getMessageByFileId } from '@server/db/queries/messages';
import { messages } from '@server/db/schema';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const deleteFileRoute = protectedProcedure
  .input(z.object({ fileId: z.number() }))
  .mutation(async ({ input, ctx }) => {
    const message = await getMessageByFileId(input.fileId);

    invariant(message, {
      code: 'NOT_FOUND',
      message: 'Message not found'
    });

    invariant(
      message.userId === ctx.user.id ||
        (await ctx.hasPermission(Permission.MANAGE_MESSAGES)),
      {
        code: 'FORBIDDEN',
        message: 'You do not have permission to delete this file'
      }
    );

    await removeFile(input.fileId);

    publishMessage(message.id, message.channelId, 'update');

    const files = await getFilesByMessageId(message.id);

    if (isEmptyMessage(message.content) && files.length == 0) {
      await db.delete(messages).where(eq(messages.id, message.id));

      publishMessage(message.id, message.channelId, 'delete');
    }
  });

export { deleteFileRoute };
