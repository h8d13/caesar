import { Permission, isEmptyMessage } from '@caesar/shared';
import { messages } from '@caesar/shared/db/schema';
import { config } from '@server/config';
import { db } from '@server/db';
import { publishMessage } from '@server/db/publishers';
import { assertDmChannel } from '@server/db/queries/dms';
import { sanitizeMessageHtml } from '@server/helpers/sanitize-html';
import { enqueueProcessMetadata } from '@server/queues/message-metadata';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const editMessageRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.sendAndEditMessage.maxRequests,
  windowMs: config.rateLimiters.sendAndEditMessage.windowMs,
  logLabel: 'editMessage'
})
  .input(
    z.object({
      messageId: z.number(),
      content: z.string()
    })
  )
  .mutation(async ({ input, ctx }) => {
    const message = await db
      .select({
        userId: messages.userId,
        channelId: messages.channelId,
        editable: messages.editable
      })
      .from(messages)
      .where(eq(messages.id, input.messageId))
      .limit(1)
      .get();

    invariant(message, {
      code: 'NOT_FOUND',
      message: 'Message not found'
    });

    await assertDmChannel(message.channelId, ctx.userId);

    invariant(message.editable, {
      code: 'FORBIDDEN',
      message: 'This message is not editable'
    });

    invariant(
      message.userId === ctx.user.id ||
        (await ctx.hasPermission(Permission.MANAGE_MESSAGES)),
      {
        code: 'FORBIDDEN',
        message: 'You do not have permission to edit this message'
      }
    );

    invariant(!isEmptyMessage(input.content), {
      code: 'BAD_REQUEST',
      message: 'Message cannot be empty.'
    });

    const sanitizedContent = sanitizeMessageHtml(input.content);

    invariant(!isEmptyMessage(sanitizedContent), {
      code: 'BAD_REQUEST',
      message:
        'Your message only contained unsupported or removed content, so there was nothing to send.'
    });

    await db
      .update(messages)
      .set({
        content: sanitizedContent,
        updatedAt: Date.now(),
        editedAt: Date.now(),
        editedBy: ctx.user.id
      })
      .where(eq(messages.id, input.messageId));

    publishMessage(input.messageId, message.channelId, 'update');
    enqueueProcessMetadata(sanitizedContent, input.messageId);
  });

export { editMessageRoute };
