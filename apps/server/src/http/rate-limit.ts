import http from 'http';
import { getWsInfo } from '../helpers/get-ws-info';
import { logger } from '../logger';
import {
  getClientRateLimitKey,
  getRateLimitRetrySeconds,
  type FixedWindowRateLimiter
} from '../utils/rate-limiters/rate-limiter';

const sendTooManyRequests = (
  res: http.ServerResponse,
  retryAfterMs: number,
  message: string
) => {
  res.setHeader('Retry-After', getRateLimitRetrySeconds(retryAfterMs));
  res.writeHead(429, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
};

// IP-keyed burst limit for plain HTTP routes. Returns whether the request
// may proceed; on false the 429 is already written. Without an IP (proxy
// hops misconfigured) the limit is skipped with a warning, matching the
// tRPC limiter.
const enforceHttpRateLimit = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  limiter: FixedWindowRateLimiter,
  route: string,
  message = 'Too many requests'
): boolean => {
  const ip = getWsInfo(undefined, req)?.ip;

  if (!ip) {
    logger.warn(
      `[Rate Limiter HTTP] Missing IP address in request info, skipping rate limiting for ${route} route.`
    );
    return true;
  }

  const key = getClientRateLimitKey(ip);
  const rateLimit = limiter.consume(key);

  if (rateLimit.allowed) return true;

  logger.debug(`[Rate Limiter HTTP] ${route} rate limited for key "${key}"`);

  // an unread upload body would otherwise stall the 429
  req.resume();
  sendTooManyRequests(res, rateLimit.retryAfterMs, message);

  return false;
};

export { enforceHttpRateLimit, sendTooManyRequests };
