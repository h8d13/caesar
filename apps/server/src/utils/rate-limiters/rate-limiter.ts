import { FixedWindowRateLimiter } from '.';

interface Clearable {
  clear: () => void;
}

const trackedRateLimiters = new Set<Clearable>();

// Register anything with a clear() so clearRateLimitersForTests resets it
// between tests. Used by both the rate limiters and the login lockout.
const trackClearable = <T extends Clearable>(clearable: T): T => {
  trackedRateLimiters.add(clearable);

  return clearable;
};

const createRateLimiter = (
  options: ConstructorParameters<typeof FixedWindowRateLimiter>[0]
) => trackClearable(new FixedWindowRateLimiter(options));

const getRateLimitRetrySeconds = (retryAfterMs: number): number => {
  return Math.max(1, Math.ceil(retryAfterMs / 1000));
};

const getClientRateLimitKey = (input?: string): string => {
  return input && input.trim().length > 0 ? input.trim() : 'unknown';
};

const clearRateLimitersForTests = () => {
  for (const limiter of trackedRateLimiters) {
    limiter.clear();
  }
};

export {
  clearRateLimitersForTests,
  createRateLimiter,
  FixedWindowRateLimiter,
  getClientRateLimitKey,
  getRateLimitRetrySeconds,
  trackClearable
};
