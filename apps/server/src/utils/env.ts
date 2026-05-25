// these values are injected at build time
const CAESAR_ENV = process.env.CAESAR_ENV;
const CAESAR_BUILD_VERSION = process.env.CAESAR_BUILD_VERSION;

const SERVER_VERSION =
  typeof CAESAR_BUILD_VERSION !== 'undefined'
    ? CAESAR_BUILD_VERSION
    : '0.0.0-dev';

const env = typeof CAESAR_ENV !== 'undefined' ? CAESAR_ENV : 'development';
const IS_PRODUCTION = env === 'production';
const IS_DEVELOPMENT = !IS_PRODUCTION;
const IS_TEST = process.env.NODE_ENV === 'test';

// Master (Bun) required CAESAR_MEDIASOUP_BIN_NAME because the embedded
// binary was renamed per build target. On Node the binary always lives at
// MEDIASOUP_PATH/mediasoup-worker, so the env var is no longer required.

const parseIntEnv = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

// Client-IP trust policy. The client IP is the key for login rate limiting,
// lockout and audit logging, so it MUST come from infrastructure we control,
// never from a header any client can forge.
//
// TRUSTED_PROXY_HOPS = number of reverse proxies in front of the app that
// append to X-Forwarded-For. The real client sits that many entries from the
// RIGHT of the chain; everything further left is attacker-supplied and
// ignored. Default 1 matches the bundled Caddy. Set 0 when the app is exposed
// directly (then only the raw socket peer is trusted and forwarding headers
// are ignored entirely).
const TRUSTED_PROXY_HOPS = parseIntEnv(
  process.env.CAESAR_TRUSTED_PROXY_HOPS,
  1
);

// Opt-in single-value real-IP header for CDN deployments (e.g. set to
// "cf-connecting-ip" behind Cloudflare). When set it overrides the XFF hop
// logic. Empty (default) means "not behind a CDN, don't trust such headers".
const TRUSTED_CLIENT_IP_HEADER = (
  process.env.CAESAR_TRUSTED_CLIENT_IP_HEADER ?? ''
)
  .trim()
  .toLowerCase();

// Failed-login lockout (#371). Escalating, IP-keyed. After MAX_FAILURES
// failed attempts inside WINDOW_MS the IP is locked for BASE_LOCK_MS,
// doubling per extra failure up to MAX_LOCK_MS. Defaults are intentionally
// looser than the per-IP burst limiter so this layer only catches sustained
// brute force across multiple burst windows.
const LOGIN_LOCKOUT_MAX_FAILURES = parseIntEnv(
  process.env.CAESAR_LOGIN_LOCKOUT_MAX_FAILURES,
  10
);
const LOGIN_LOCKOUT_WINDOW_MS = parseIntEnv(
  process.env.CAESAR_LOGIN_LOCKOUT_WINDOW_MS,
  15 * 60_000
);
const LOGIN_LOCKOUT_BASE_LOCK_MS = parseIntEnv(
  process.env.CAESAR_LOGIN_LOCKOUT_BASE_LOCK_MS,
  5 * 60_000
);
const LOGIN_LOCKOUT_MAX_LOCK_MS = parseIntEnv(
  process.env.CAESAR_LOGIN_LOCKOUT_MAX_LOCK_MS,
  60 * 60_000
);

export {
  IS_DEVELOPMENT,
  IS_PRODUCTION,
  IS_TEST,
  LOGIN_LOCKOUT_BASE_LOCK_MS,
  LOGIN_LOCKOUT_MAX_FAILURES,
  LOGIN_LOCKOUT_MAX_LOCK_MS,
  LOGIN_LOCKOUT_WINDOW_MS,
  SERVER_VERSION,
  TRUSTED_CLIENT_IP_HEADER,
  TRUSTED_PROXY_HOPS
};
