import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test';
import {
  FixedWindowRateLimiter,
  TokenBucketRateLimiter
} from '../rate-limiters';

describe('FixedWindowRateLimiter', () => {
  let now = 1000;
  let originalDateNow: typeof Date.now;

  beforeEach(() => {
    now = 1000;
    originalDateNow = Date.now;
    Date.now = () => now;
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  test('allows requests until max, then blocks', () => {
    const limiter = new FixedWindowRateLimiter({
      maxRequests: 3,
      windowMs: 10_000
    });

    expect(limiter.consume('127.0.0.1')).toEqual({
      allowed: true,
      remaining: 2,
      retryAfterMs: 0
    });

    expect(limiter.consume('127.0.0.1')).toEqual({
      allowed: true,
      remaining: 1,
      retryAfterMs: 0
    });

    expect(limiter.consume('127.0.0.1')).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterMs: 0
    });

    const blocked = limiter.consume('127.0.0.1');

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBe(10_000);
  });

  test('resets counter after the time window expires', () => {
    const limiter = new FixedWindowRateLimiter({
      maxRequests: 1,
      windowMs: 5_000
    });

    expect(limiter.consume('1.2.3.4').allowed).toBe(true);
    expect(limiter.consume('1.2.3.4').allowed).toBe(false);

    now += 5_000;

    const afterReset = limiter.consume('1.2.3.4');

    expect(afterReset).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterMs: 0
    });
  });

  test('tracks limits independently per key', () => {
    const limiter = new FixedWindowRateLimiter({
      maxRequests: 1,
      windowMs: 60_000
    });

    expect(limiter.consume('ip-a').allowed).toBe(true);
    expect(limiter.consume('ip-a').allowed).toBe(false);
    expect(limiter.consume('ip-b').allowed).toBe(true);
  });

  test('clear removes all tracked keys', () => {
    const limiter = new FixedWindowRateLimiter({
      maxRequests: 1,
      windowMs: 60_000
    });

    limiter.consume('ip-a');
    expect(limiter.consume('ip-a').allowed).toBe(false);

    limiter.clear();

    expect(limiter.consume('ip-a')).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterMs: 0
    });
  });

  test('evicts oldest key when maxEntries is reached', () => {
    const limiter = new FixedWindowRateLimiter({
      maxRequests: 2,
      windowMs: 60_000,
      maxEntries: 2
    });

    limiter.consume('a');
    limiter.consume('b');
    limiter.consume('c');

    const aAfterEviction = limiter.consume('a');

    expect(aAfterEviction).toEqual({
      allowed: true,
      remaining: 1,
      retryAfterMs: 0
    });
  });
});

describe('TokenBucketRateLimiter', () => {
  let now = 1000;
  let originalDateNow: typeof Date.now;

  beforeEach(() => {
    now = 1000;
    originalDateNow = Date.now;
    Date.now = () => now;
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  // 10 tokens, one earned back per second
  const create = (maxEntries?: number) =>
    new TokenBucketRateLimiter({
      maxRequests: 10,
      windowMs: 10_000,
      maxEntries
    });

  test('allows a burst up to the capacity, then blocks', () => {
    const limiter = create();

    for (let i = 0; i < 10; i++) {
      expect(limiter.consume('user').allowed).toBe(true);
    }

    expect(limiter.consume('user')).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterMs: 1000
    });
  });

  test('earns tokens back evenly instead of all at a window edge', () => {
    const limiter = create();

    for (let i = 0; i < 10; i++) limiter.consume('user');

    now += 2500;

    expect(limiter.consume('user').allowed).toBe(true);
    expect(limiter.consume('user').allowed).toBe(true);
    // 2.5 earned, 2 spent: half a token left
    expect(limiter.consume('user')).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterMs: 500
    });
  });

  test('never holds more than the capacity', () => {
    const limiter = create();

    limiter.consume('user');
    now += 60 * 60 * 1000;

    expect(limiter.consume('user').remaining).toBe(9);
  });

  test('a call can cost several tokens', () => {
    const limiter = create();

    expect(limiter.consume('user', 4).remaining).toBe(6);
    expect(limiter.consume('user', 4).remaining).toBe(2);
    expect(limiter.consume('user', 4)).toEqual({
      allowed: false,
      remaining: 2,
      retryAfterMs: 2000
    });
    // a refused call spends nothing
    expect(limiter.consume('user', 2).allowed).toBe(true);
  });

  test('keeps keys apart', () => {
    const limiter = create();

    for (let i = 0; i < 10; i++) limiter.consume('a');

    expect(limiter.consume('a').allowed).toBe(false);
    expect(limiter.consume('b').allowed).toBe(true);
  });

  test('at maxEntries, drops refilled buckets before live ones', () => {
    const limiter = create(2);

    for (let i = 0; i < 10; i++) limiter.consume('idle');

    now += 10_000;

    for (let i = 0; i < 10; i++) limiter.consume('busy');

    // 'idle' has refilled: it makes room, 'busy' keeps its empty bucket
    limiter.consume('new');

    expect(limiter.consume('busy').allowed).toBe(false);
  });
});
