import { DisconnectCode } from '@caesar/shared';
import { users } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import {
  isRememberedToken,
  mintSessionToken,
  stageSessionRefresh
} from '@server/helpers/session-token';
import { protectedProcedure } from '@server/utils/trpc';
import { closeUserSessions } from '@server/utils/wss';
import { eq, sql } from 'drizzle-orm';
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
    // stale. Stage a fresh one; the client redeems the nonce at
    // /session/refresh for the new cookie so the next reconnect / page load
    // doesn't bounce off the new epoch.
    const newToken = await mintSessionToken(
      ctx.userId,
      sessionEpoch,
      isRememberedToken(ctx.token)
    );

    closeUserSessions(
      ctx.userId,
      'Signed out from another session',
      DisconnectCode.SESSION_SUPERSEDED,
      ctx.token
    );

    return { refreshNonce: stageSessionRefresh(ctx.userId, newToken) };
  });

export { signOutOtherSessionsRoute };
