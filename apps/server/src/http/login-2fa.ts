import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import http from 'http';
import jwt from 'jsonwebtoken';
import z from 'zod';
import { getServerToken } from '../db/queries/server';
import { getUserById } from '../db/queries/users';
import { getWsInfo } from '../helpers/get-ws-info';
import { logger } from '../logger';
import {
  createRateLimiter,
  getClientRateLimitKey,
  getRateLimitRetrySeconds
} from '../utils/rate-limiters/rate-limiter';
import { verifyLoginAssertion } from '../utils/webauthn';
import { getJsonBody } from './helpers';
import { issueSession } from './session';
import { HttpValidationError } from './utils';

// Reuse the joinServer bucket since this is part of the same login attempt.
const login2faRateLimiter = createRateLimiter({
  maxRequests: 30,
  windowMs: 60_000
});

const GENERIC_2FA_ERROR = 'Two-factor authentication failed.';

const zBody = z.object({
  preAuthToken: z.string().min(1),
  response: z.unknown()
});

type PreAuthClaims = {
  userId: number;
  type: 'pre-2fa';
};

const verifyPreAuthToken = async (
  token: string
): Promise<PreAuthClaims | null> => {
  try {
    const decoded = jwt.verify(token, await getServerToken()) as PreAuthClaims;
    if (decoded.type !== 'pre-2fa' || typeof decoded.userId !== 'number') {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
};

const login2faRouteHandler = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  const data = zBody.parse(await getJsonBody(req));
  const connectionInfo = getWsInfo(undefined, req);

  if (connectionInfo?.ip) {
    const key = getClientRateLimitKey(connectionInfo.ip);
    const rateLimit = login2faRateLimiter.consume(key);

    if (!rateLimit.allowed) {
      res.setHeader(
        'Retry-After',
        getRateLimitRetrySeconds(rateLimit.retryAfterMs)
      );
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Too many 2FA attempts. Please try again shortly.'
        })
      );

      return;
    }
  }

  const claims = await verifyPreAuthToken(data.preAuthToken);

  if (!claims) {
    logger.info(
      `[Auth] /login/2fa rejected: invalid or expired preAuthToken (IP: ${connectionInfo?.ip || 'unknown'})`
    );
    throw new HttpValidationError('preAuthToken', GENERIC_2FA_ERROR);
  }

  // Re-fetch the user. They may have been banned (or deleted) between the
  // password step and now.
  const user = await getUserById(claims.userId);

  if (!user) {
    logger.info(
      `[Auth] /login/2fa rejected: user ${claims.userId} no longer exists`
    );
    throw new HttpValidationError('preAuthToken', GENERIC_2FA_ERROR);
  }

  if (user.banned) {
    logger.info(`[Auth] /login/2fa rejected: user ${claims.userId} now banned`);
    throw new HttpValidationError(
      'preAuthToken',
      `Identity banned: ${user.banReason || 'No reason provided'}`
    );
  }

  const result = await verifyLoginAssertion(
    claims.userId,
    data.response as AuthenticationResponseJSON
  );

  if (!result.verified) {
    logger.info(
      `[Auth] /login/2fa verification failed for user ${claims.userId}: ${result.reason} (IP: ${connectionInfo?.ip || 'unknown'})`
    );
    throw new HttpValidationError('response', GENERIC_2FA_ERROR);
  }

  return issueSession(user, res);
};

export { login2faRouteHandler };
