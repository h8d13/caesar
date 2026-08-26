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
import { enqueueActivityLog } from '@server/queues/activity-log';
import { invariant } from '@server/utils/invariant';
import { hashPassword } from '@server/utils/password';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { closeUserSessions } from '@server/utils/wss';
import crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { assertCanModifyOwnerUser } from './assert-can-modify-owner-user';

// 18 random bytes -> 24 base64url chars. The moderator never picks the
// value: a generated one-shot credential can't be a reused/weak password,
// and it is returned exactly once (never stored in plaintext, never
// re-readable) so the mod has to relay it out-of-band.
const TEMPORARY_PASSWORD_BYTES = 18;

const generateTemporaryPassword = () =>
  crypto.randomBytes(TEMPORARY_PASSWORD_BYTES).toString('base64url');

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

    const temporaryPassword = generateTemporaryPassword();

    // Same write shape as users.updatePassword: bumping sessionEpoch is what
    // actually revokes tokens (getUserByToken is the only gate), so a reset
    // for a compromised account takes effect immediately. No token is spared
    // here: unlike a self-service change, the caller is not the target.
    await db
      .update(users)
      .set({
        password: await hashPassword(temporaryPassword),
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
