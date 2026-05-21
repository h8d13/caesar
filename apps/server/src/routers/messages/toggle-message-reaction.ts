import { Permission } from '@caesar/shared';
import { messageReactions, messages } from '@caesar/shared/db/schema';
import { config } from '@server/config';
import { db } from '@server/db';
import { publishMessage } from '@server/db/publishers';
import { getEmojiFileIdByEmojiName } from '@server/db/queries/emojis';
import { getReaction } from '@server/db/queries/messages';
import { assertChannelAccess } from '@server/helpers/assert-channel-access';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

const toggleMessageReactionRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.toggleMessageReaction.maxRequests,
  windowMs: config.rateLimiters.toggleMessageReaction.windowMs,
  logLabel: 'toggleMessageReaction'
})
  .input(
    z.object({
      messageId: z.number(),
      emoji: z.string()
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.REACT_TO_MESSAGES);

    const message = await db
      .select()
      .from(messages)
      .where(eq(messages.id, input.messageId))
      .get();

    invariant(message, {
      code: 'NOT_FOUND',
      message: 'Message not found'
    });

    await assertChannelAccess(ctx, message.channelId);

    const reaction = await getReaction(
      input.messageId,
      input.emoji,
      ctx.user.id
    );

    if (!reaction) {
      const emojiFileId = await getEmojiFileIdByEmojiName(input.emoji);

      await db.insert(messageReactions).values({
        messageId: input.messageId,
        emoji: input.emoji,
        userId: ctx.user.id,
        fileId: emojiFileId,
        createdAt: Date.now()
      });
    } else {
      await db
        .delete(messageReactions)
        .where(
          and(
            eq(messageReactions.messageId, input.messageId),
            eq(messageReactions.emoji, input.emoji),
            eq(messageReactions.userId, ctx.user.id)
          )
        );
    }

    publishMessage(input.messageId, message.channelId, 'update');
  });

export { toggleMessageReactionRoute };
