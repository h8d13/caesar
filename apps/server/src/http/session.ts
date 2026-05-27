import { DisconnectCode, type TJoinedUser } from '@caesar/shared';
import { users } from '@caesar/shared/db/schema';
import { eq, sql } from 'drizzle-orm';
import http from 'http';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { getJwtSecret } from '../utils/jwt-secret';
import { closeUserSessions } from '../utils/wss';

// Single-session by default: bump sessionEpoch so prior tokens fail the
// equality check in getUserByToken and prior WS connections get kicked.
// Users opted in to multi-session keep the current epoch so their existing
// tokens remain valid alongside the new one.
const issueSession = async (
  user: TJoinedUser,
  res: http.ServerResponse
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

  const token = jwt.sign(
    { userId: user.id, sessionEpoch },
    await getJwtSecret(),
    { expiresIn: '604800s' /* 7 days */ }
  );

  if (!user.allowMultipleSessions) {
    closeUserSessions(
      user.id,
      'Another device connected.',
      DisconnectCode.SESSION_SUPERSEDED,
      token
    );
  }

  res.setHeader(
    'Set-Cookie',
    `caesar-token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/public; Max-Age=604800`
  );
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true, token }));

  return res;
};

export { issueSession };
