import { DisconnectCode } from '@caesar/shared';
import { users } from '@caesar/shared/db/schema';
import { eq, sql } from 'drizzle-orm';
import http from 'http';
import { db } from '../db';
import { getUserByToken } from '../db/queries/users';
import { closeUserSessions } from '../utils/wss';

const CLEAR_COOKIE =
  'caesar-token=; HttpOnly; Secure; SameSite=Strict; Path=/public; Max-Age=0';

// Idempotent: unknown/expired token still gets 200 + clearing Set-Cookie so
// the client can call this against stale state without branching. When the
// token resolves to a user, bump sessionEpoch.

const logoutRouteHandler = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  const token =
    (req.headers['x-token'] as string | undefined) ||
    req.headers.cookie
      ?.split('; ')
      .find((c) => c.startsWith('caesar-token='))
      ?.split('=')
      .slice(1)
      .join('=');

  const user = await getUserByToken(token || undefined);

  if (user) {
    await db
      .update(users)
      .set({ sessionEpoch: sql`${users.sessionEpoch} + 1` })
      .where(eq(users.id, user.id));

    closeUserSessions(user.id, 'Logged out.', DisconnectCode.LOGGED_OUT);
  }

  res.setHeader('Set-Cookie', CLEAR_COOKIE);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true }));
};

export { logoutRouteHandler };
