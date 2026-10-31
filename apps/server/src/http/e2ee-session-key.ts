import { BASE64_32_BYTES_REGEX } from '@caesar/shared';
import { e2eeSessionKeys } from '@caesar/shared/db/schema';
import { createHash } from 'crypto';
import { and, eq, ne } from 'drizzle-orm';
import type http from 'http';
import z from 'zod';
import { config } from '../config';
import { db } from '../db';
import { getSessionUserByToken } from '../db/queries/users';
import { getSessionToken } from '../helpers/session-token';
import { createRateLimiter } from '../utils/rate-limiters/rate-limiter';
import { getJsonBody, sendJson } from './helpers';

const NO_STORE = { 'Cache-Control': 'no-store' };
import { enforceHttpRateLimit } from './rate-limit';

// Wrap key half of the auto-login E2EE unlock (see e2eeSessionKeys). Plain
// HTTP rather than tRPC because auto-login needs the key before connecting,
// and the WS context only authenticates at joinServer.

const e2eeSessionKeyRateLimiter = createRateLimiter({
  maxRequests: config.rateLimiters.e2eeSessionKey.maxRequests,
  windowMs: config.rateLimiters.e2eeSessionKey.windowMs
});

// 32 random bytes
const zBody = z.object({
  wrapKey: z.string().regex(BASE64_32_BYTES_REGEX)
});

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const authenticate = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  if (
    !enforceHttpRateLimit(
      req,
      res,
      e2eeSessionKeyRateLimiter,
      '/e2ee/session-key'
    )
  ) {
    return;
  }

  const token = getSessionToken(req);
  const user = await getSessionUserByToken(token);

  if (!token || !user) {
    sendJson(res, 401, { error: 'Unauthorized' }, NO_STORE);
    return;
  }

  return { user, tokenHash: hashToken(token) };
};

const storeE2eeSessionKeyRouteHandler = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  const auth = await authenticate(req, res);

  if (!auth) return;

  const { wrapKey } = zBody.parse(await getJsonBody(req));
  const { user, tokenHash } = auth;

  await db
    .insert(e2eeSessionKeys)
    .values({
      tokenHash,
      userId: user.id,
      sessionEpoch: user.sessionEpoch,
      wrapKey,
      createdAt: Date.now()
    })
    .onConflictDoUpdate({
      target: e2eeSessionKeys.tokenHash,
      set: { wrapKey, sessionEpoch: user.sessionEpoch, createdAt: Date.now() }
    });

  // rows from revoked sessions can never be fetched again; drop them now
  // rather than waiting for the prune cron
  await db
    .delete(e2eeSessionKeys)
    .where(
      and(
        eq(e2eeSessionKeys.userId, user.id),
        ne(e2eeSessionKeys.sessionEpoch, user.sessionEpoch)
      )
    );

  sendJson(res, 200, { success: true }, NO_STORE);
};

const getE2eeSessionKeyRouteHandler = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  const auth = await authenticate(req, res);

  if (!auth) return;

  const { user, tokenHash } = auth;

  // the session lookup already enforces the epoch for the token; matching
  // it on the row as well keeps a stale row dead even if that check changes
  const row = await db
    .select({ wrapKey: e2eeSessionKeys.wrapKey })
    .from(e2eeSessionKeys)
    .where(
      and(
        eq(e2eeSessionKeys.tokenHash, tokenHash),
        eq(e2eeSessionKeys.userId, user.id),
        eq(e2eeSessionKeys.sessionEpoch, user.sessionEpoch)
      )
    )
    .get();

  if (!row) {
    sendJson(res, 404, { error: 'Not found' }, NO_STORE);
    return;
  }

  sendJson(res, 200, { wrapKey: row.wrapKey }, NO_STORE);
};

export { getE2eeSessionKeyRouteHandler, storeE2eeSessionKeyRouteHandler };
