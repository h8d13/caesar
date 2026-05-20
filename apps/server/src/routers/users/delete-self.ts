import { protectedProcedure } from '@server/utils/trpc';
import { z } from 'zod';
import { performUserDeletion } from './delete-user';

const deleteSelfRoute = protectedProcedure
  .input(
    z.object({
      wipe: z.boolean().default(false)
    })
  )
  .mutation(async ({ ctx, input }) => {
    // Don't close the caller's own ws here, the mutation reply still has
    // to flow back over it. Client tears down (disconnectFromServer)
    // after the await resolves.
    await performUserDeletion({
      targetUserId: ctx.userId,
      actorUserId: ctx.userId,
      wipe: input.wipe,
      reason: 'Account deleted by user',
      userWs: undefined
    });
  });

export { deleteSelfRoute };
