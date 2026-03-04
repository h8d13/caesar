import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { publishMessage, publishUser } from '../../db/publishers';
import { messages, socialCreditLedger } from '../../db/schema';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const toggleMessageScVoteRoute = protectedProcedure
  .input(
    z.object({
      messageId: z.number(),
      type: z.enum(['upvote', 'downvote'])
    })
  )
  .mutation(async ({ input, ctx }) => {
    const message = await db
      .select({
        id: messages.id,
        userId: messages.userId,
        channelId: messages.channelId
      })
      .from(messages)
      .where(eq(messages.id, input.messageId))
      .get();

    invariant(message, {
      code: 'NOT_FOUND',
      message: 'Message not found'
    });

    invariant(message.userId !== ctx.user.id, {
      code: 'BAD_REQUEST',
      message: 'You cannot vote on your own message.'
    });

    const newValue = input.type === 'upvote' ? 1 : -1;

    const existingVote = await db
      .select({
        id: socialCreditLedger.id,
        amount: socialCreditLedger.amount
      })
      .from(socialCreditLedger)
      .where(
        and(
          eq(socialCreditLedger.ledgerableType, 'message_vote'),
          eq(socialCreditLedger.ledgerableId, input.messageId),
          eq(socialCreditLedger.voterId, ctx.user.id)
        )
      )
      .get();

    if (!existingVote) {
      // No existing vote — insert
      await db.insert(socialCreditLedger).values({
        targetId: message.userId,
        voterId: ctx.user.id,
        ledgerableType: 'message_vote',
        ledgerableId: input.messageId,
        amount: newValue,
        createdAt: Date.now()
      });
    } else if (existingVote.amount === newValue) {
      // Same direction — toggle off (remove vote)
      await db
        .delete(socialCreditLedger)
        .where(eq(socialCreditLedger.id, existingVote.id));
    } else {
      // Opposite direction — switch vote
      await db
        .update(socialCreditLedger)
        .set({ amount: newValue })
        .where(eq(socialCreditLedger.id, existingVote.id));
    }

    await publishUser(message.userId, 'update');
    publishMessage(input.messageId, message.channelId, 'update');
  });

export { toggleMessageScVoteRoute };
