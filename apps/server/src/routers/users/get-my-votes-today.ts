import { and, eq, gte } from 'drizzle-orm';
import { db } from '@server/db';
import { socialCreditVotes } from '@server/db/schema';
import { protectedProcedure } from '@server/utils/trpc';

const getStartOfDay = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
};

const getMyVotesTodayRoute = protectedProcedure.query(async ({ ctx }) => {
  const startOfDay = getStartOfDay();

  const votes = await db
    .select({ targetId: socialCreditVotes.targetId })
    .from(socialCreditVotes)
    .where(
      and(
        eq(socialCreditVotes.voterId, ctx.user.id),
        gte(socialCreditVotes.createdAt, startOfDay)
      )
    )
    .all();

  return votes.map((v) => v.targetId);
});

export { getMyVotesTodayRoute };
