import { invites, roles, userRoles, users } from '@caesar/shared/db/schema';
import { login } from '@server/__tests__/helpers';
import { tdb } from '@server/__tests__/setup';
import { getJwtSecret } from '@server/utils/jwt-secret';
import { setRateLimitingDisabled } from '@server/utils/rate-limiters';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { afterEach, describe, expect, test } from 'vitest';

describe('/login', () => {
  test('should successfully login with valid credentials', async () => {
    const response = await login('testowner', 'password123');

    expect(response.status).toBe(200);

    const data = (await response.json()) as { success: boolean; token: string };

    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('token');

    const decoded = jwt.verify(data.token, await getJwtSecret());

    expect(decoded).toHaveProperty('userId');
  });

  test('should fail login with invalid password', async () => {
    const response = await login('testowner', 'wrongpassword');

    expect(response.status).toBe(400);

    const data: any = await response.json();

    expect(data).toHaveProperty('errors');
    // generic anti-enumeration error: same string + same field as the
    // "unknown identity / missing invite" path so the two cases are
    // indistinguishable to a probing client.
    expect(data.errors).toHaveProperty('identity');
    expect(data.errors.identity).toMatch(/Invalid credentials/);
  });

  test('should fail signup without invite when DB has users', async () => {
    // testowner exists in the seed, so new signups require a valid invite.
    const response = await login('newuser', 'newpassword123');

    expect(response.status).toBe(400);

    const data: any = await response.json();

    expect(data).toHaveProperty('errors');
    expect(data.errors).toHaveProperty('identity');
    expect(data.errors.identity).toMatch(/Invalid credentials/);
  });

  test('signup-without-invite and wrong-password return identical errors', async () => {
    // Anti-enumeration: probing the endpoint must not let an attacker
    // distinguish "this username does not exist" from "this username
    // exists but the password is wrong."
    const unknownUser = await login('nonexistent', 'somepassword');
    const wrongPassword = await login('testowner', 'wrongpassword');

    const u: any = await unknownUser.json();
    const w: any = await wrongPassword.json();

    expect(u.errors).toEqual(w.errors);
  });

  test('signup rejects identities with non-alphanumeric prefix or symbols', async () => {
    await tdb.insert(invites).values({
      code: 'FORMATINVITE',
      creatorId: 1,
      maxUses: 5,
      uses: 0,
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now()
    });

    const cases = ["' or '1'='1", '-leading-dash', '@admin', 'has space'];

    for (const identity of cases) {
      const response = await login(identity, 'password123', 'FORMATINVITE');
      expect(response.status).toBe(400);

      const data: any = await response.json();
      expect(data.errors?.identity).toMatch(/letters/);
    }
  });

  test('signup accepts standard alphanumeric and _ / -', async () => {
    await tdb.insert(invites).values({
      code: 'GOODFORMAT',
      creatorId: 1,
      maxUses: 10,
      uses: 0,
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now()
    });

    for (const identity of ['alice', 'bob_42', 'eve-x', 'h8d13']) {
      const response = await login(identity, 'password123', 'GOODFORMAT');
      expect(response.status).toBe(200);
    }
  });

  test('should allow registration with a valid invite', async () => {
    await tdb.insert(invites).values({
      code: 'TESTINVITE123',
      creatorId: 1,
      maxUses: 5,
      uses: 0,
      expiresAt: Date.now() + 86400000, // 1 day
      createdAt: Date.now()
    });

    const response = await login('inviteuser', 'password123', 'TESTINVITE123');

    expect(response.status).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('token');

    const updatedInvite = await tdb
      .select()
      .from(invites)
      .where(eq(invites.code, 'TESTINVITE123'))
      .get();

    expect(updatedInvite?.uses).toBe(1);
  });

  test('should fail with expired invite', async () => {
    await tdb.insert(invites).values({
      code: 'EXPIREDINVITE',
      creatorId: 1,
      maxUses: 5,
      uses: 0,
      expiresAt: Date.now() - 1000, // expired
      createdAt: Date.now() - 86400000
    });

    const response = await login(
      'expiredinviteuser',
      'password123',
      'EXPIREDINVITE'
    );

    expect(response.status).toBe(400);

    const data: any = await response.json();

    expect(data).toHaveProperty('errors');
    expect(data.errors).toHaveProperty('identity');
  });

  test('should fail with maxed out invite', async () => {
    // Create a maxed out invite
    await tdb.insert(invites).values({
      code: 'MAXEDINVITE',
      creatorId: 1,
      maxUses: 2,
      uses: 2,
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now()
    });

    const response = await login(
      'maxedinviteuser',
      'password123',
      'MAXEDINVITE'
    );

    expect(response.status).toBe(400);

    const data: any = await response.json();

    expect(data).toHaveProperty('errors');
    expect(data.errors).toHaveProperty('identity');
  });

  test('should fail with non-existent invite', async () => {
    const response = await login(
      'fakeinviteuser',
      'password123',
      'FAKEINVITECODE'
    );

    expect(response.status).toBe(400);

    const data: any = await response.json();

    expect(data).toHaveProperty('errors');
    expect(data.errors).toHaveProperty('identity');
  });

  test('should fail login for banned user', async () => {
    await tdb
      .update(users)
      .set({
        banned: true,
        banReason: 'Test ban reason'
      })
      .where(eq(users.identity, 'testuser'));

    const response = await login('testuser', 'password123');

    expect(response.status).toBe(400);

    const data: any = await response.json();

    expect(data).toHaveProperty('errors');
    expect(data.errors).toHaveProperty('identity');
    expect(data.errors.identity).toContain('banned');
  });

  test('should hide ban status from a banned user with the wrong password', async () => {
    // Anti-enumeration: the ban check runs only after the password is
    // verified, so a wrong password yields the same generic error as any
    // other failure. An attacker can't probe which accounts are banned.
    await tdb
      .update(users)
      .set({
        banned: true,
        banReason: 'Test ban reason'
      })
      .where(eq(users.identity, 'testuser'));

    const response = await login('testuser', 'wrongpassword');

    expect(response.status).toBe(400);

    const data: any = await response.json();

    expect(data).toHaveProperty('errors');
    expect(data.errors).toHaveProperty('identity');
    expect(data.errors.identity).toMatch(/Invalid credentials/);
    expect(data.errors.identity).not.toContain('banned');
    expect(data.errors.identity).not.toContain('Test ban reason');
  });

  test('should fail with missing identity', async () => {
    const response = await login('', 'somepassword');

    expect(response.status).toBe(400);

    const data = await response.json();

    expect(data).toHaveProperty('errors');
  });

  test('should fail with missing password', async () => {
    const response = await login('someidentity', '');

    expect(response.status).toBe(400);

    const data = await response.json();

    expect(data).toHaveProperty('errors');
  });

  test('should return valid JWT token with userId claim', async () => {
    const response = await login('testowner', 'password123');

    expect(response.status).toBe(200);

    const data: any = await response.json();

    const decoded = jwt.verify(
      data.token,
      await getJwtSecret()
    ) as jwt.JwtPayload;

    expect(decoded).toHaveProperty('userId');
    expect(typeof decoded.userId).toBe('number');
    expect(decoded).toHaveProperty('exp');
    expect(decoded).toHaveProperty('iat');
  });

  test('should assign default role to newly registered user', async () => {
    await tdb.insert(invites).values({
      code: 'ROLEINVITE',
      creatorId: 1,
      maxUses: 5,
      uses: 0,
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now()
    });

    const response = await login('roleuser', 'password123', 'ROLEINVITE');

    expect(response.status).toBe(200);

    const newUser = await tdb
      .select()
      .from(users)
      .where(eq(users.identity, 'roleuser'))
      .get();

    expect(newUser).toBeTruthy();

    const userRole = await tdb
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, newUser!.id))
      .get();

    expect(userRole).toBeTruthy();

    const role = await tdb
      .select()
      .from(roles)
      .where(eq(roles.id, userRole!.roleId))
      .get();

    expect(role?.isDefault).toBe(true);
  });

  test('should rate limit excessive login attempts', async () => {
    for (let i = 0; i < 5; i++) {
      const response = await login('testowner', 'wrongpassword');

      expect(response.status).toBe(400);
    }

    const limitedResponse = await login('testowner', 'wrongpassword');

    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.headers.get('retry-after')).toBeTruthy();

    const data = await limitedResponse.json();

    expect(data).toHaveProperty(
      'error',
      'Too many login attempts. Please try again shortly.'
    );
  });

  test('should trim identity', async () => {
    const response = await login('  testowner  ', 'password123');

    expect(response.status).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('token');
  });

  test('identity should be case-insensitive', async () => {
    const response = await login('TESTOWNER', 'password123');

    expect(response.status).toBe(200);

    const data = (await response.json()) as { token: string };

    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('token');

    const decoded = jwt.verify(
      data.token,
      await getJwtSecret()
    ) as jwt.JwtPayload;

    expect(decoded).toHaveProperty('userId');

    const firstUser = await tdb
      .select()
      .from(users)
      .where(eq(users.id, decoded.userId))
      .get();

    const response2 = await login('testowner', 'password123');

    expect(response2.status).toBe(200);

    const data2 = (await response2.json()) as { token: string };

    const decoded2 = jwt.verify(
      data2.token,
      await getJwtSecret()
    ) as jwt.JwtPayload;

    expect(decoded2).toHaveProperty('userId');
    expect(decoded2.userId).toBe(firstUser?.id);
  });
});

describe('/login failed-attempt lockout (#371)', () => {
  // Disable the per-IP burst limiter so failures can accumulate past its
  // 5/60s window and reach the lockout threshold (default 10). The lockout
  // itself is independent of this flag, so it still engages.
  afterEach(() => {
    setRateLimitingDisabled(false);
  });

  test('locks the IP out after sustained failed attempts', async () => {
    setRateLimitingDisabled(true);

    for (let i = 0; i < 10; i++) {
      const response = await login('testowner', 'wrongpassword');
      expect(response.status).toBe(400);
    }

    const locked = await login('testowner', 'wrongpassword');

    expect(locked.status).toBe(429);
    expect(locked.headers.get('retry-after')).toBeTruthy();

    const data = await locked.json();

    expect(data).toHaveProperty(
      'error',
      'Too many failed login attempts. Please try again later.'
    );
  });

  test('a successful login resets the failure count', async () => {
    setRateLimitingDisabled(true);

    for (let i = 0; i < 9; i++) {
      const response = await login('testowner', 'wrongpassword');
      expect(response.status).toBe(400);
    }

    // Correct password clears the IP's accumulated failures.
    const success = await login('testowner', 'password123');
    expect(success.status).toBe(200);

    // Without the reset these two would be failures #10 and #11 -> the second
    // would be locked out (429). With the reset they are #1 and #2.
    const first = await login('testowner', 'wrongpassword');
    expect(first.status).toBe(400);

    const second = await login('testowner', 'wrongpassword');
    expect(second.status).toBe(400);
  });

  test('does not lock out when the IP stays under the threshold', async () => {
    setRateLimitingDisabled(true);

    for (let i = 0; i < 9; i++) {
      const response = await login('testowner', 'wrongpassword');
      expect(response.status).toBe(400);
    }
  });
});
