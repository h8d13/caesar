import { describe, expect, test } from 'vite-plus/test';
import { LoginLockout } from '../login-lockout';

const create = () =>
  new LoginLockout({
    maxFailures: 3,
    windowMs: 60_000,
    baseLockMs: 60_000,
    maxLockMs: 600_000
  });

const IP = '203.0.113.7';

describe('login lockout', () => {
  test('locks a key after maxFailures', () => {
    const lockout = create();

    lockout.recordFailure(IP, 'victim');
    lockout.recordFailure(IP, 'victim');

    expect(lockout.check(IP).locked).toBe(false);

    lockout.recordFailure(IP, 'victim');

    expect(lockout.check(IP).locked).toBe(true);
  });

  test('a success forgives the failures of that identity', () => {
    const lockout = create();

    lockout.recordFailure(IP, 'me');
    lockout.recordFailure(IP, 'me');
    lockout.recordSuccess(IP, 'me');
    lockout.recordFailure(IP, 'me');
    lockout.recordFailure(IP, 'me');

    expect(lockout.check(IP).locked).toBe(false);
  });

  test('a success on one identity does not reset failures against another', () => {
    const lockout = create();

    // guesses at the victim, interleaved with logins to the attacker's own
    // account: this used to reset the counter every time
    lockout.recordFailure(IP, 'victim');
    lockout.recordSuccess(IP, 'attacker');
    lockout.recordFailure(IP, 'victim');
    lockout.recordSuccess(IP, 'attacker');
    lockout.recordFailure(IP, 'victim');

    expect(lockout.check(IP).locked).toBe(true);
  });

  test('a success lifts a lock that only its own failures caused', () => {
    const lockout = create();

    lockout.recordFailure(IP, 'me');
    lockout.recordFailure(IP, 'me');
    lockout.recordFailure(IP, 'me');

    expect(lockout.check(IP).locked).toBe(true);

    lockout.recordSuccess(IP, 'me');

    expect(lockout.check(IP).locked).toBe(false);
  });
});
