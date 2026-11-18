import { IS_DEVELOPMENT, IS_TEST } from '../env';

// Test seam: lets tests force the limiter to allow everything. Module-scoped
// instead of a global flag so server typecheck doesnt need an ambient.
let rateLimitingDisabled = false;
const setRateLimitingDisabled = (value: boolean) => {
  rateLimitingDisabled = value;
};

// disable rate limiting in development but not in tests
const isRateLimitingBypassed = () =>
  (IS_DEVELOPMENT && !IS_TEST) || rateLimitingDisabled;

type TFixedWindowRateLimiterOptions = {
  maxRequests: number;
  windowMs: number;
  maxEntries?: number;
};

type TRateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

type TRateLimitEntry = {
  count: number;
  resetAt: number;
};

// this is a pretty basic implementation of a fixed window rate limiter, but for now it's better than nothing
class FixedWindowRateLimiter {
  private readonly entries = new Map<string, TRateLimitEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly maxEntries: number;

  constructor({
    maxRequests,
    windowMs,
    maxEntries = 10_000 // default to 10k entries
  }: TFixedWindowRateLimiterOptions) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.maxEntries = maxEntries;
  }

  public consume = (key: string): TRateLimitResult => {
    if (isRateLimitingBypassed()) {
      return {
        allowed: true,
        remaining: this.maxRequests,
        retryAfterMs: 0
      };
    }

    const now = Date.now();

    this.gc(now);

    const existing = this.entries.get(key);

    if (!existing || existing.resetAt <= now) {
      this.entries.set(key, {
        count: 1,
        resetAt: now + this.windowMs
      });

      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        retryAfterMs: 0
      };
    }

    if (existing.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: existing.resetAt - now
      };
    }

    existing.count += 1;

    return {
      allowed: true,
      remaining: this.maxRequests - existing.count,
      retryAfterMs: 0
    };
  };

  public clear = () => {
    this.entries.clear();
  };

  private gc = (now: number) => {
    if (this.entries.size < this.maxEntries) {
      return;
    }

    for (const [key, value] of this.entries) {
      if (value.resetAt <= now) {
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

type TTokenBucket = {
  tokens: number;
  updatedAt: number;
};

// Token bucket: a key holds up to `maxRequests` tokens and earns them back
// evenly, `maxRequests` per `windowMs`. Unlike the fixed window above it
// has no reset edge to burst across, and a call can cost more than one
// token, so one bucket can cover routes of very different weight.
class TokenBucketRateLimiter {
  private readonly buckets = new Map<string, TTokenBucket>();
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly maxEntries: number;

  constructor({
    maxRequests,
    windowMs,
    maxEntries = 10_000
  }: TFixedWindowRateLimiterOptions) {
    this.capacity = maxRequests;
    this.refillPerMs = maxRequests / windowMs;
    this.maxEntries = maxEntries;
  }

  public consume = (key: string, cost = 1): TRateLimitResult => {
    if (isRateLimitingBypassed()) {
      return { allowed: true, remaining: this.capacity, retryAfterMs: 0 };
    }

    const now = Date.now();
    const bucket = this.buckets.get(key);
    const tokens = bucket ? this.refilled(bucket, now) : this.capacity;

    if (tokens < cost) {
      // a cost above the capacity can never be paid: report a full refill
      const missing = Math.min(cost, this.capacity) - tokens;

      return {
        allowed: false,
        remaining: Math.floor(tokens),
        retryAfterMs: Math.ceil(missing / this.refillPerMs)
      };
    }

    if (!bucket) this.gc(now);

    this.buckets.set(key, { tokens: tokens - cost, updatedAt: now });

    return {
      allowed: true,
      remaining: Math.floor(tokens - cost),
      retryAfterMs: 0
    };
  };

  public clear = () => {
    this.buckets.clear();
  };

  private refilled = (bucket: TTokenBucket, now: number) =>
    Math.min(
      this.capacity,
      bucket.tokens + (now - bucket.updatedAt) * this.refillPerMs
    );

  // A bucket that has refilled is the same as no bucket, so those go
  // first; only then the oldest insertion.
  private gc = (now: number) => {
    if (this.buckets.size < this.maxEntries) return;

    for (const [key, bucket] of this.buckets) {
      if (this.refilled(bucket, now) >= this.capacity) this.buckets.delete(key);
    }

    if (this.buckets.size < this.maxEntries) return;

    const oldestKey = this.buckets.keys().next().value;

    if (oldestKey !== undefined) this.buckets.delete(oldestKey);
  };
}

export {
  FixedWindowRateLimiter,
  setRateLimitingDisabled,
  TokenBucketRateLimiter
};
export type { TRateLimitResult };
