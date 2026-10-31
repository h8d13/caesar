import { DisconnectCode, type TJoinedUser } from '@caesar/shared';
import { users } from '@caesar/shared/db/schema';
import { eq, sql } from 'drizzle-orm';
import type http from 'http';
import { db } from '../db';
import {
  mintSessionToken,
  sessionCookieHeaders
} from '../helpers/session-token';
import { closeUserSessions } from '../utils/wss';
import { sendJson } from './helpers';

// Single-session by default: bump sessionEpoch so prior tokens fail the
// equality check in resolveSessionToken and prior WS connections get kicked.
// Users opted in to multi-session keep the current epoch so their existing
// tokens remain valid alongside the new one.
// The token only ever leaves in the HttpOnly cookie, never in the body.
const issueSession = async (
  user: TJoinedUser,
  res: http.ServerResponse,
  remember: boolean
): Promise<http.ServerResponse> => {
  let sessionEpoch: number;

  if (user.allowMultipleSessions) {
    sessionEpoch = user.sessionEpoch ?? 0;
  } else {
    const updated = await db
      .update(users)
      .set({ sessionEpoch: sql`${users.sessionEpoch} + 1` })
      .where(eq(users.id, user.id))
      .returning({ sessionEpoch: users.sessionEpoch })
      .get();

    sessionEpoch = updated?.sessionEpoch ?? 0;
  }

  const token = await mintSessionToken(user.id, sessionEpoch, remember);

  if (!user.allowMultipleSessions) {
    closeUserSessions(
      user.id,
      'Another device connected.',
      DisconnectCode.SESSION_SUPERSEDED,
      token
    );
  }

  res.setHeader('Set-Cookie', sessionCookieHeaders(token, remember));
  sendJson(res, 200, { success: true });

  return res;
};

export { issueSession };
