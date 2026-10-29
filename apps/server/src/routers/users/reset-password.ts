import {
  ActivityLogType,
  DELETED_USER_IDENTITY_AND_NAME,
  DisconnectCode,
  Permission
} from '@caesar/shared';
import { users } from '@caesar/shared/db/schema';
import { config } from '@server/config';
import { db } from '@server/db';
import { getUserById } from '@server/db/queries/users';
import { assertCanModifyOwnerUser } from '@server/helpers/assert-can-modify-owner-user';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { invariant } from '@server/utils/invariant';
import { generateTemporaryPassword } from '@server/utils/password';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { closeUserSessions } from '@server/utils/wss';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

const resetPasswordRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.resetPassword.maxRequests,
  windowMs: config.rateLimiters.resetPassword.windowMs,
  logLabel: 'resetPassword'
})
  .input(
    z.object({
      userId: z.number()
    })
  )
  .mutation(async ({ ctx, input }) => {
    await ctx.needsPermission(Permission.MANAGE_USERS);

    // Self-reset would hand the caller a credential without proving the
    // current one; users.updatePassword is the path for your own account.
    invariant(input.userId !== ctx.user.id, {
      code: 'BAD_REQUEST',
      message: 'Use Change Password in your settings to reset your own account.'
    });

    await assertCanModifyOwnerUser(
      ctx.userId,
      input.userId,
      'reset the password of'
    );

    const target = await getUserById(input.userId);
    invariant(target, { code: 'NOT_FOUND', message: 'User not found' });

    invariant(target.identity !== DELETED_USER_IDENTITY_AND_NAME, {
      code: 'BAD_REQUEST',
      message: 'Cannot reset the password of the deleted user placeholder.'
    });

    const { temporaryPassword, hash } = await generateTemporaryPassword(
      target.identity
    );

    // Same write shape as users.updatePassword: bumping sessionEpoch is what
    // actually revokes tokens (getUserByToken is the only gate), so a reset
    // for a compromised account takes effect immediately. No token is spared
    // here: unlike a self-service change, the caller is not the target.
    await db
      .update(users)
      .set({
        password: hash,
        sessionEpoch: sql`${users.sessionEpoch} + 1`,
        updatedAt: Date.now()
      })
      .where(eq(users.id, input.userId));

    closeUserSessions(
      input.userId,
      'Your password was reset by an admin. Please sign in again.',
      DisconnectCode.SESSION_SUPERSEDED
    );

    enqueueActivityLog({
      type: ActivityLogType.USER_PASSWORD_RESET,
      userId: input.userId,
      details: {
        resetBy: ctx.userId
      }
    });

    return { temporaryPassword };
  });

export { resetPasswordRoute };
