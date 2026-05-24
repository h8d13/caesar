import {
  socialCreditLedger,
  socialCreditVotes,
  users
} from '@caesar/shared/db/schema';
import { config } from '@server/config';
import { db } from '@server/db';
import { publishUser } from '@server/db/publishers';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { and, eq, gte } from 'drizzle-orm';
import z from 'zod';

const UPVOTE_VALUE = 10;
const DOWNVOTE_VALUE = -5;

const getStartOfDay = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
};

const voteSocialCreditRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.voteSocialCredit.maxRequests,
  windowMs: config.rateLimiters.voteSocialCredit.windowMs,
  logLabel: 'voteSocialCredit'
})
  .input(
    z.object({
      targetUserId: z.number(),
      type: z.enum(['upvote', 'downvote'])
    })
  )
  .mutation(async ({ ctx, input }) => {
    invariant(input.targetUserId !== ctx.user.id, {
      code: 'BAD_REQUEST',
      message: 'You cannot vote for yourself.'
    });

    const targetUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.targetUserId))
      .get();

    invariant(targetUser, {
      code: 'NOT_FOUND',
      message: 'User not found.'
    });

    const startOfDay = getStartOfDay();

    const existingVote = await db
      .select({ id: socialCreditVotes.id })
      .from(socialCreditVotes)
      .where(
        and(
          eq(socialCreditVotes.voterId, ctx.user.id),
          eq(socialCreditVotes.targetId, input.targetUserId),
          gte(socialCreditVotes.createdAt, startOfDay)
        )
      )
      .get();

    invariant(!existingVote, {
      code: 'BAD_REQUEST',
      message: 'You have already voted for this user today.'
    });

    const value = input.type === 'upvote' ? UPVOTE_VALUE : DOWNVOTE_VALUE;

    const now = Date.now();

    await db.insert(socialCreditVotes).values({
      voterId: ctx.user.id,
      targetId: input.targetUserId,
      value,
      createdAt: now
    });

    await db.insert(socialCreditLedger).values({
      targetId: input.targetUserId,
      voterId: ctx.user.id,
      ledgerableType: 'user_vote',
      ledgerableId: input.targetUserId,
      amount: value,
      createdAt: now
    });

    await publishUser(input.targetUserId, 'update');
  });

export { voteSocialCreditRoute };
