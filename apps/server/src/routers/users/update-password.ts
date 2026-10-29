import {
  ActivityLogType,
  AUTH_KEY_REGEX,
  DisconnectCode
} from '@caesar/shared';
import { users } from '@caesar/shared/db/schema';
import { config } from '@server/config';
import { db } from '@server/db';
import {
  isRememberedToken,
  mintSessionToken,
  stageSessionRefresh
} from '@server/helpers/session-token';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { invariant } from '@server/utils/invariant';
import { hashPassword, verifyPassword } from '@server/utils/password';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { closeUserSessions } from '@server/utils/wss';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

const updatePasswordRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.updatePassword.maxRequests,
  windowMs: config.rateLimiters.updatePassword.windowMs,
  logLabel: 'updatePassword'
})
  .input(
    z.object({
      // authKeys derived client-side, as at /login; length and
      // confirmation checks on the passwords happen there too
      currentAuthKey: z.string().regex(AUTH_KEY_REGEX),
      newAuthKey: z.string().regex(AUTH_KEY_REGEX)
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
      input.currentAuthKey,
      user.password
    );

    if (!currentPasswordValid) {
      ctx.throwValidationError(
        'currentPassword',
        'Current password is incorrect'
      );
    }

    const hashedNewPassword = await hashPassword(input.newAuthKey);

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

    const newToken = await mintSessionToken(
      ctx.userId,
      sessionEpoch,
      isRememberedToken(ctx.token)
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

    // redeemed at /session/refresh, as in signOutOtherSessions
    return { refreshNonce: stageSessionRefresh(ctx.userId, newToken) };
  });

export { updatePasswordRoute };
