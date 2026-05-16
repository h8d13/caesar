import { and, count, eq, gte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@server/db';
import { publishMessage, publishUser } from '@server/db/publishers';
import { messages, socialCreditLedger } from '@server/db/schema';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';

const MAX_MESSAGE_VOTES_PER_DAY = 15;

const getStartOfDay = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
};

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

    // Only check daily limit when casting a new vote (not when toggling off or switching)
    if (!existingVote) {
      const startOfDay = getStartOfDay();

      const [{ total } = { total: 0 }] = await db
        .select({ total: count() })
        .from(socialCreditLedger)
        .where(
          and(
            eq(socialCreditLedger.voterId, ctx.user.id),
            eq(socialCreditLedger.ledgerableType, 'message_vote'),
            gte(socialCreditLedger.createdAt, startOfDay)
          )
        );

      invariant(total < MAX_MESSAGE_VOTES_PER_DAY, {
        code: 'BAD_REQUEST',
        message: `You can only vote on ${MAX_MESSAGE_VOTES_PER_DAY} messages per day.`
      });

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
