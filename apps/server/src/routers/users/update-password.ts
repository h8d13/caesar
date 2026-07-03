import { ActivityLogType, DisconnectCode } from '@caesar/shared';
import { users } from '@caesar/shared/db/schema';
import { config } from '@server/config';
import { db } from '@server/db';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { invariant } from '@server/utils/invariant';
import { getJwtSecret } from '@server/utils/jwt-secret';
import { hashPassword, verifyPassword } from '@server/utils/password';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { closeUserSessions } from '@server/utils/wss';
import { eq, sql } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const updatePasswordRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.updatePassword.maxRequests,
  windowMs: config.rateLimiters.updatePassword.windowMs,
  logLabel: 'updatePassword'
})
  .input(
    z.object({
      currentPassword: z.string().min(4).max(128),
      newPassword: z.string().min(4).max(128),
      confirmNewPassword: z.string().min(4).max(128)
    })
  )
  .mutation(async ({ ctx, input }) => {
    const user = await db
      .select({
        password: users.password
      })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .get();

    invariant(user, {
      code: 'NOT_FOUND',
      message: 'User not found'
    });

    const currentPasswordValid = await verifyPassword(
      input.currentPassword,
      user.password
    );

    if (!currentPasswordValid) {
      ctx.throwValidationError(
        'currentPassword',
        'Current password is incorrect'
      );
    }

    if (input.newPassword !== input.confirmNewPassword) {
      ctx.throwValidationError(
        'confirmNewPassword',
        'New password and confirmation do not match'
      );
    }

    const hashedNewPassword = await hashPassword(input.confirmNewPassword);

    // Bump sessionEpoch in the same write: a password change must revoke
    // any token an attacker may already hold, and sessionEpoch is the only
    // gate getUserByToken checks. The caller's own WS stays alive (gets a
    // fresh token below); every other session is booted.
    const updated = await db
      .update(users)
      .set({
        password: hashedNewPassword,
        sessionEpoch: sql`${users.sessionEpoch} + 1`
      })
      .where(eq(users.id, ctx.userId))
      .returning({ sessionEpoch: users.sessionEpoch })
      .get();

    const sessionEpoch = updated?.sessionEpoch ?? 0;

    const newToken = jwt.sign(
      { userId: ctx.userId, sessionEpoch },
      await getJwtSecret(),
      { expiresIn: '604800s' }
    );

    closeUserSessions(
      ctx.userId,
      'Your password was changed',
      DisconnectCode.SESSION_SUPERSEDED,
      ctx.token
    );

    enqueueActivityLog({
      type: ActivityLogType.USER_UPDATED_PASSWORD,
      userId: ctx.user.id
    });

    return { token: newToken };
  });

export { updatePasswordRoute };
