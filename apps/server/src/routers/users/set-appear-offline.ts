import { ServerEvents } from '@caesar/shared';
import { users } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { getPublicUserById } from '@server/db/queries/users';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const setAppearOfflineRoute = protectedProcedure
  .input(z.object({ value: z.boolean() }))
  .mutation(async ({ ctx, input }) => {
    await db
      .update(users)
      .set({ appearOffline: input.value })
      .where(eq(users.id, ctx.userId));

    // peers reflect the change live: turning on -> they see USER_LEAVE
    // (offline); turning off -> they see USER_JOIN at the user's real
    // status. the joiner's own client updates from the mutation return
    // value, not from a broadcast (which is stripped of the flag anyway).
    if (input.value) {
      ctx.pubsub.publish(ServerEvents.USER_LEAVE, ctx.userId);
    } else {
      const publicUser = await getPublicUserById(ctx.userId);

      if (publicUser) {
        const realStatus = ctx.getStatusById(ctx.userId);
        const { appearOffline, ...broadcastUser } = publicUser;
        void appearOffline;

        ctx.pubsub.publish(ServerEvents.USER_JOIN, {
          ...broadcastUser,
          status: realStatus
        });
      }
    }

    return { appearOffline: input.value };
  });

export { setAppearOfflineRoute };
