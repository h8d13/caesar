import { DisconnectCode } from '@caesar/shared';
import { users } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { getJwtSecret } from '@server/utils/jwt-secret';
import { protectedProcedure } from '@server/utils/trpc';
import { closeUserSessions } from '@server/utils/wss';
import { eq, sql } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const signOutOtherSessionsRoute = protectedProcedure
  .input(z.void())
  .mutation(async ({ ctx }) => {
    const updated = await db
      .update(users)
      .set({ sessionEpoch: sql`${users.sessionEpoch} + 1` })
      .where(eq(users.id, ctx.userId))
      .returning({ sessionEpoch: users.sessionEpoch })
      .get();

    const sessionEpoch = updated?.sessionEpoch ?? 0;

    // Caller's WS stays alive (no kick), but its old token is now epoch-
    // stale. Hand back a fresh JWT so the next reconnect / page load
    // doesn't bounce off the new epoch.
    const newToken = jwt.sign(
      { userId: ctx.userId, sessionEpoch },
      await getJwtSecret(),
      { expiresIn: '604800s' }
    );

    closeUserSessions(
      ctx.userId,
      'Signed out from another session',
      DisconnectCode.SESSION_SUPERSEDED,
      ctx.token
    );

    return { token: newToken };
  });

export { signOutOtherSessionsRoute };
