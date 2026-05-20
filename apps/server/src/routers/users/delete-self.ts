import { users } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { invariant } from '@server/utils/invariant';
import { verifyPassword } from '@server/utils/password';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { performUserDeletion } from './delete-user';

const deleteSelfRoute = protectedProcedure
  .input(
    z.object({
      currentPassword: z.string().min(4).max(128),
      wipe: z.boolean().default(false)
    })
  )
  .mutation(async ({ ctx, input }) => {
    const user = await db
      .select({ password: users.password })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .get();

    invariant(user, {
      code: 'NOT_FOUND',
      message: 'User not found'
    });

    const passwordValid = await verifyPassword(
      input.currentPassword,
      user.password
    );

    if (!passwordValid) {
      ctx.throwValidationError(
        'currentPassword',
        'Current password is incorrect'
      );
    }

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
