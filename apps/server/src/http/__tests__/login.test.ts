import { OWNER_ROLE_ID } from '@caesar/shared';
import { invites, roles, userRoles, users } from '@caesar/shared/db/schema';
import {
  getRoleIdByName,
  getSessionCookie,
  login
} from '@server/__tests__/helpers';
import { tdb, testsBaseUrl } from '@server/__tests__/setup';
import { getJwtSecret } from '@server/utils/jwt-secret';
import { deriveAuthKey } from '@server/utils/password';
import { setRateLimitingDisabled } from '@server/utils/rate-limiters';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { afterEach, describe, expect, test } from 'vite-plus/test';

// Inserts an invite carrying roleId, signs identity up with it and returns
// the role ids the new user ended up with.
const signupWithRoleInvite = async (identity: string, roleId: number) => {
  const code = `INV-${identity}`;

  await tdb.insert(invites).values({
    code,
    creatorId: 1,
    roleId,
    createdAt: Date.now()
  });

  const response = await login(identity, 'password123', code);

  expect(response.status).toBe(200);

  const user = await tdb
    .select({ id: users.id })
    .from(users)
    .where(eq(users.identity, identity))
    .get();

  const assigned = await tdb
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, user!.id));

  return assigned.map((r) => r.roleId);
};

describe('/login', () => {
  test('should successfully login with valid credentials', async () => {
    const response = await login('testowner', 'password123');

    expect(response.status).toBe(200);

    const data = (await response.json()) as { success: boolean };

    expect(data).toHaveProperty('success', true);

    const decoded = jwt.verify(
      getSessionCookie(response)!,
      await getJwtSecret()
    );

    expect(decoded).toHaveProperty('userId');
  });

  test('token only leaves as an HttpOnly cookie, never in the body', async () => {
    const response = await login('testowner', 'password123');
    const data = await response.json();

    expect(data).not.toHaveProperty('token');

    const cookie = response.headers
      .getSetCookie()
      .find((c) => c.startsWith('caesar-session='))!;

    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toMatch(/Path=\/(;|$)/);
    // remember not requested: a browser-session cookie
    expect(cookie).not.toContain('Max-Age');
  });

  test('refuses a cross-origin login (login CSRF)', async () => {
    const response = await fetch(`${testsBaseUrl}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'https://evil.example'
      },
      body: JSON.stringify({
        identity: 'testowner',
        authKey: await deriveAuthKey('password123', 'testowner')
      })
    });

    expect(response.status).toBe(403);
    expect(getSessionCookie(response)).toBeUndefined();
  });

  test('remember gives a persistent cookie', async () => {
    const response = await fetch(`${testsBaseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identity: 'testowner',
        authKey: await deriveAuthKey('password123', 'testowner'),
        remember: true
      })
    });

    const cookie = response.headers
      .getSetCookie()
      .find((c) => c.startsWith('caesar-session='))!;

    expect(cookie).toContain('Max-Age=604800');
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

    // rejected before the invite is touched, so no use was spent
    const invite = await tdb
      .select({ uses: invites.uses })
      .from(invites)
      .where(eq(invites.code, 'FORMATINVITE'))
      .get();
    expect(invite?.uses).toBe(0);
  });

  test('parallel signups cannot exceed an invite maxUses', async () => {
    await tdb.insert(invites).values({
      code: 'SINGLEUSE',
      creatorId: 1,
      maxUses: 1,
      uses: 0,
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now()
    });

    const responses = await Promise.all(
      ['race-a', 'race-b', 'race-c'].map((identity) =>
        login(identity, 'password123', 'SINGLEUSE')
      )
    );

    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);

    const invite = await tdb
      .select({ uses: invites.uses })
      .from(invites)
      .where(eq(invites.code, 'SINGLEUSE'))
      .get();
    expect(invite?.uses).toBe(1);
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
    expect(getSessionCookie(response)).toBeTruthy();

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

  test('answers an oversized body with 413 instead of a reset', async () => {
    const response = await fetch(`${testsBaseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: 'x'.repeat(256 * 1024) })
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toHaveProperty('error', 'Payload too large');
  });

  test('refuses a plaintext password in place of the authKey', async () => {
    const response = await fetch(`${testsBaseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: 'testowner', password: 'password123' })
    });

    expect(response.status).toBe(400);

    const data = await response.json();

    expect(data).toHaveProperty('errors');
  });

  test('should return valid JWT token with userId claim', async () => {
    const response = await login('testowner', 'password123');

    expect(response.status).toBe(200);

    const decoded = jwt.verify(
      getSessionCookie(response)!,
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

  test('should assign the invite role on top of the default role', async () => {
    const guestId = await getRoleIdByName('Guest');
    const roleIds = await signupWithRoleInvite('guestuser', guestId);

    expect(roleIds).toContain(guestId);
    expect(roleIds).toHaveLength(2);
  });

  test('should never grant the owner role from an invite row', async () => {
    // add-invite refuses this; a direct insert stands in for a pre-guard row
    const roleIds = await signupWithRoleInvite('owneruser', OWNER_ROLE_ID);

    expect(roleIds).not.toContain(OWNER_ROLE_ID);
    expect(roleIds).toHaveLength(1);
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
    expect(getSessionCookie(response)).toBeTruthy();
  });

  test('identity should be case-insensitive', async () => {
    const response = await login('TESTOWNER', 'password123');

    expect(response.status).toBe(200);

    expect(await response.json()).toHaveProperty('success', true);

    const decoded = jwt.verify(
      getSessionCookie(response)!,
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

    const decoded2 = jwt.verify(
      getSessionCookie(response2)!,
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
