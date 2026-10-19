import { DisconnectCode } from '@caesar/shared';
import { e2eeSessionKeys, users } from '@caesar/shared/db/schema';
import { eq, sql } from 'drizzle-orm';
import http from 'http';
import { db } from '../db';
import { getUserByToken } from '../db/queries/users';
import {
  clearSessionCookieHeaders,
  getSessionToken
} from '../helpers/session-token';
import { closeUserSessions } from '../utils/wss';

// Idempotent: unknown/expired token still gets 200 + clearing Set-Cookie so
// the client can call this against stale state without branching. When the
// token resolves to a user, bump sessionEpoch.

const logoutRouteHandler = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  const user = await getUserByToken(getSessionToken(req));

  if (user) {
    // the epoch bump below already revokes every session; also drop their
    // E2EE wrap keys now instead of leaving them for the prune cron
    await db.delete(e2eeSessionKeys).where(eq(e2eeSessionKeys.userId, user.id));

    await db
      .update(users)
      .set({ sessionEpoch: sql`${users.sessionEpoch} + 1` })
      .where(eq(users.id, user.id));

    closeUserSessions(user.id, 'Logged out.', DisconnectCode.LOGGED_OUT);
  }

  res.setHeader('Set-Cookie', clearSessionCookieHeaders());
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true }));
};

export { logoutRouteHandler };
