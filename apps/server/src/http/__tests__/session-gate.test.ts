import { users } from '@caesar/shared/db/schema';
import { getMockedToken, uploadFile } from '@server/__tests__/helpers';
import { tdb, testsBaseUrl } from '@server/__tests__/setup';
import { getJwtSecret } from '@server/utils/jwt-secret';
import { eq, sql } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { describe, expect, test } from 'vite-plus/test';

// Every token-authenticated HTTP route goes through resolveSessionToken.
// Pins that each one refuses the tokens the gate must reject, whichever
// user loader the route picks.

const USER_ID = 2;

const getEpoch = async () => {
  const row = await tdb
    .select({ sessionEpoch: users.sessionEpoch })
    .from(users)
    .where(eq(users.id, USER_ID))
    .get();

  return row!.sessionEpoch;
};

const signToken = async (payload: object) =>
  jwt.sign(payload, await getJwtSecret(), { expiresIn: '86400s' });

const revokedTokens = [
  {
    label: 'banned user',
    mint: async () => {
      const token = await getMockedToken(USER_ID);

      await tdb
        .update(users)
        .set({ banned: true })
        .where(eq(users.id, USER_ID));

      return token;
    }
  },
  {
    label: 'superseded session',
    mint: async () => {
      const token = await getMockedToken(USER_ID);

      await tdb
        .update(users)
        .set({ sessionEpoch: sql`${users.sessionEpoch} + 1` })
        .where(eq(users.id, USER_ID));

      return token;
    }
  },
  {
    label: 'pre-2fa token',
    mint: async () =>
      signToken({
        userId: USER_ID,
        sessionEpoch: await getEpoch(),
        type: 'pre-2fa'
      })
  },
  {
    label: 'unknown user',
    mint: () => signToken({ userId: 999_999, sessionEpoch: 0 })
  }
];

const expectUnauthorized = async (res: Response) => {
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: 'Unauthorized' });
};

const wrapKey = Buffer.alloc(32, 7).toString('base64');

const routes = [
  {
    route: 'POST /upload',
    check: async (token: string) =>
      expectUnauthorized(await uploadFile(new File(['x'], 'gate.txt'), token))
  },
  {
    route: 'POST /e2ee/session-key',
    check: async (token: string) =>
      expectUnauthorized(
        await fetch(`${testsBaseUrl}/e2ee/session-key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-token': token },
          body: JSON.stringify({ wrapKey })
        })
      )
  },
  {
    route: 'GET /e2ee/session-key',
    check: async (token: string) =>
      expectUnauthorized(
        await fetch(`${testsBaseUrl}/e2ee/session-key`, {
          headers: { 'x-token': token }
        })
      )
  },
  {
    // idempotent 200 either way; a rejected token must not bump the epoch
    route: 'POST /logout',
    check: async (token: string) => {
      const epoch = await getEpoch();
      const res = await fetch(`${testsBaseUrl}/logout`, {
        method: 'POST',
        headers: { 'x-token': token }
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
      expect(await getEpoch()).toBe(epoch);
    }
  }
];

describe.each(routes)('$route session gate', ({ check }) => {
  test.each(revokedTokens)('rejects a $label', async ({ mint }) => {
    await check(await mint());
  });
});
