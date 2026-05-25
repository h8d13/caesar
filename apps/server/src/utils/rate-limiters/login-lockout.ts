import { IS_DEVELOPMENT, IS_TEST } from '../env';
import { trackClearable } from './rate-limiter';

// Failed-login lockout (#371). Sits behind the per-IP burst rate limiter and
// targets *sustained* brute force: after `maxFailures` failed attempts inside
// `windowMs`, the key (client IP) is locked for `baseLockMs`, doubling for
// every additional failure up to `maxLockMs`.
//
// Deliberately IP-keyed only, not per-account. Per-account lockout hands an
// attacker a trivial denial-of-service: spam failures against a victim's
// identity to lock the real user out. Distributed brute force is instead
// mitigated by 2FA (webauthn) and password strength, not by locking accounts.
//
// State is in-memory (same as the rate limiters): a restart clears it. That
// is an accepted trade-off for a single-instance self-hosted deployment; a
// persistent ban store would be the next step for multi-instance setups.

type TLoginLockoutOptions = {
  maxFailures: number;
  windowMs: number;
  baseLockMs: number;
  maxLockMs: number;
  maxEntries?: number;
};

type TLockoutEntry = {
  failures: number;
  windowStart: number;
  lockedUntil: number;
};

type TLockoutStatus = {
  locked: boolean;
  retryAfterMs: number;
};

// Cap the doubling exponent so the lock duration math never deals with
// non-finite numbers; maxLockMs caps the result anyway.
const MAX_BACKOFF_EXPONENT = 30;

class LoginLockout {
  private readonly entries = new Map<string, TLockoutEntry>();
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly baseLockMs: number;
  private readonly maxLockMs: number;
  private readonly maxEntries: number;

  constructor({
    maxFailures,
    windowMs,
    baseLockMs,
    maxLockMs,
    maxEntries = 10_000
  }: TLoginLockoutOptions) {
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
    this.baseLockMs = baseLockMs;
    this.maxLockMs = maxLockMs;
    this.maxEntries = maxEntries;
  }

  private get disabled(): boolean {
    // Mirror FixedWindowRateLimiter: off in development, on in tests so the
    // behaviour can be asserted.
    return IS_DEVELOPMENT && !IS_TEST;
  }

  // Read-only lock check. Does not count as an attempt.
  public check = (key: string): TLockoutStatus => {
    if (this.disabled) {
      return { locked: false, retryAfterMs: 0 };
    }

    const now = Date.now();
    const entry = this.entries.get(key);

    if (entry && entry.lockedUntil > now) {
      return { locked: true, retryAfterMs: entry.lockedUntil - now };
    }

    return { locked: false, retryAfterMs: 0 };
  };

  public recordFailure = (key: string): void => {
    if (this.disabled) return;

    const now = Date.now();

    this.gc(now);

    const existing = this.entries.get(key);

    let entry: TLockoutEntry = existing ?? {
      failures: 0,
      windowStart: now,
      lockedUntil: 0
    };

    // Start a fresh window once the previous one elapsed and the key is not
    // currently locked (a locked key keeps accumulating so repeat offenders
    // escalate instead of resetting).
    if (entry.lockedUntil <= now && now - entry.windowStart > this.windowMs) {
      entry = { failures: 0, windowStart: now, lockedUntil: 0 };
    }

    entry.failures += 1;

    if (entry.failures >= this.maxFailures) {
      const exponent = Math.min(
        entry.failures - this.maxFailures,
        MAX_BACKOFF_EXPONENT
      );
      const lockMs = Math.min(this.baseLockMs * 2 ** exponent, this.maxLockMs);
      entry.lockedUntil = now + lockMs;
    }

    this.entries.set(key, entry);
  };

  // Clear on a successful authentication so a legitimate user who eventually
  // gets their password right is not penalised by earlier typos.
  public recordSuccess = (key: string): void => {
    this.entries.delete(key);
  };

  public clear = (): void => {
    this.entries.clear();
  };

  private gc = (now: number): void => {
    if (this.entries.size < this.maxEntries) {
      return;
    }

    for (const [key, entry] of this.entries) {
      const windowExpired = now - entry.windowStart > this.windowMs;
      if (entry.lockedUntil <= now && windowExpired) {
        this.entries.delete(key);
      }
    }

    if (this.entries.size < this.maxEntries) {
      return;
    }

    const oldestKey = this.entries.keys().next().value;

    if (oldestKey) {
      this.entries.delete(oldestKey);
    }
  };
}

const createLoginLockout = (options: TLoginLockoutOptions): LoginLockout =>
  trackClearable(new LoginLockout(options));

export { createLoginLockout, LoginLockout };
export type { TLockoutStatus };
