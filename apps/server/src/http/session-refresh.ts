import type http from 'http';
import z from 'zod';
import { getSessionUserByToken } from '../db/queries/users';
import {
  getSessionToken,
  isRememberedToken,
  sessionCookieHeaders,
  takeSessionRefresh
} from '../helpers/session-token';
import type { TTokenPayload } from '../types';
import { verifyJwt } from '../utils/jwt-secret';
import { getJsonBody, sendJson } from './helpers';

const zBody = z.object({ nonce: z.string().min(1).max(128) });

// Redeems a nonce staged by a token-reminting mutation (see
// stageSessionRefresh) into the new session cookie. The caller's current
// cookie is epoch-stale by now, so only its signature and user are checked:
// it proves the request comes from the browser that ran the mutation.
const sessionRefreshRouteHandler = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  const { nonce } = zBody.parse(await getJsonBody(req));
  const entry = takeSessionRefresh(nonce);
  const currentToken = getSessionToken(req);

  let currentUserId: number | undefined;

  try {
    const decoded = currentToken
      ? await verifyJwt<TTokenPayload & { type?: string }>(currentToken)
      : undefined;

    if (decoded && decoded.type !== 'pre-2fa') currentUserId = decoded.userId;
  } catch {
    // invalid or expired: treated as no session below
  }

  // the staged token must still be live (no logout or ban since)
  if (
    !entry ||
    currentUserId !== entry.userId ||
    !(await getSessionUserByToken(entry.token))
  ) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  res.setHeader(
    'Set-Cookie',
    sessionCookieHeaders(entry.token, isRememberedToken(entry.token))
  );
  sendJson(res, 200, { success: true });
};

export { sessionRefreshRouteHandler };
