import { randomBytes } from 'crypto';
import type http from 'http';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../utils/jwt-secret';

// The session JWT lives only in an HttpOnly cookie, so page script (and an
// XSS) can never read it. The x-token header stays accepted for non-browser
// clients and tests: a browser can't send it without first reading the
// token, which the cookie makes impossible.

const SESSION_COOKIE = 'caesar-session';
const SESSION_MAX_AGE_S = 604800; // 7 days

// pre-HttpOnly builds set the token on Path=/public; clear it wherever the
// session cookie is set or cleared so a stale copy can't shadow the new one
const LEGACY_COOKIE_CLEAR =
  'caesar-token=; HttpOnly; Secure; SameSite=Strict; Path=/public; Max-Age=0';

const mintSessionToken = async (
  userId: number,
  sessionEpoch: number,
  remember: boolean
) =>
  jwt.sign({ userId, sessionEpoch, remember }, await getJwtSecret(), {
    expiresIn: `${SESSION_MAX_AGE_S}s`
  });

// remember=false gives a browser-session cookie (gone when the browser
// closes); the JWT itself still expires after SESSION_MAX_AGE_S
const sessionCookieHeaders = (token: string, remember: boolean) => [
  `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/${remember ? `; Max-Age=${SESSION_MAX_AGE_S}` : ''}`,
  LEGACY_COOKIE_CLEAR
];

const clearSessionCookieHeaders = () => [
  `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`,
  LEGACY_COOKIE_CLEAR
];

const getCookie = (req: http.IncomingMessage, name: string) =>
  req.headers.cookie
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1) || undefined;

// A cookie rides along on any request the browser makes to this host, so
// cookie auth also requires the request to come from our own page. Browsers
// always send Origin on WebSocket upgrades and cross-origin fetches. Compared
// by hostname: cookies are host-scoped, not port-scoped, and dev serves the
// page from :5173 while the WebSocket goes straight to :4991.
const isCrossOrigin = (req: http.IncomingMessage) => {
  const origin = req.headers.origin;

  if (!origin) return false;

  try {
    return (
      new URL(origin).hostname !==
      new URL(`http://${req.headers.host ?? ''}`).hostname
    );
  } catch {
    return true;
  }
};

const getSessionToken = (req: http.IncomingMessage): string | undefined => {
  const cookieToken = getCookie(req, SESSION_COOKIE);

  if (cookieToken && !isCrossOrigin(req)) return cookieToken;

  return (req.headers['x-token'] as string | undefined) || undefined;
};

// tRPC runs over the WebSocket, which can't set cookies. Mutations that
// re-mint the caller's token (signOutOtherSessions, updatePassword) stage it
// here and hand the client a one-time nonce; POST /session/refresh redeems it
// into a Set-Cookie. The nonce alone is useless: redeeming also needs the
// caller's (HttpOnly) session cookie for the same user.
const REFRESH_TTL_MS = 60_000;

const pendingRefreshes = new Map<
  string,
  { userId: number; token: string; expiresAt: number }
>();

const stageSessionRefresh = (userId: number, token: string) => {
  const now = Date.now();

  for (const [nonce, entry] of pendingRefreshes) {
    if (entry.expiresAt <= now) pendingRefreshes.delete(nonce);
  }

  const nonce = randomBytes(32).toString('base64url');

  pendingRefreshes.set(nonce, {
    userId,
    token,
    expiresAt: now + REFRESH_TTL_MS
  });

  return nonce;
};

// single use: the nonce is spent even if the caller then fails the checks
const takeSessionRefresh = (nonce: string) => {
  const entry = pendingRefreshes.get(nonce);

  pendingRefreshes.delete(nonce);

  if (!entry || entry.expiresAt <= Date.now()) return;

  return entry;
};

// the remember flag rides in the JWT so a re-mint keeps the cookie's kind
const isRememberedToken = (token: string) =>
  (jwt.decode(token) as { remember?: boolean } | null)?.remember === true;

export {
  clearSessionCookieHeaders,
  getCookie,
  getSessionToken,
  isCrossOrigin,
  isRememberedToken,
  mintSessionToken,
  SESSION_COOKIE,
  sessionCookieHeaders,
  stageSessionRefresh,
  takeSessionRefresh
};
