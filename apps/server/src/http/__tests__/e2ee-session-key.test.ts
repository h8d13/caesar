import { e2eeSessionKeys, users } from '@caesar/shared/db/schema';
import { loginToken } from '@server/__tests__/helpers';
import { tdb, testsBaseUrl } from '@server/__tests__/setup';
import { pruneE2eeSessionKeys } from '@server/crons/prune-e2ee-session-keys';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, test } from 'vite-plus/test';

const WRAP_KEY = Buffer.alloc(32, 7).toString('base64');

const getToken = () => loginToken('testowner', 'password123');

const store = (token: string | undefined, wrapKey: string = WRAP_KEY) =>
  fetch(`${testsBaseUrl}/e2ee/session-key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-token': token } : {})
    },
    body: JSON.stringify({ wrapKey })
  });

const fetchKey = (token: string | undefined) =>
  fetch(`${testsBaseUrl}/e2ee/session-key`, {
    headers: token ? { 'x-token': token } : {}
  });

describe('/e2ee/session-key', () => {
  test('stores and returns the wrap key for the same token', async () => {
    const token = await getToken();

    expect((await store(token)).status).toBe(200);

    const res = await fetchKey(token);

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ wrapKey: WRAP_KEY });
  });

  test('never stores the raw token', async () => {
    const token = await getToken();

    await store(token);

    const rows = await tdb.select().from(e2eeSessionKeys).all();

    expect(rows.length).toBe(1);
    expect(rows[0]!.tokenHash).not.toBe(token);
    expect(rows[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('rejects missing or invalid tokens', async () => {
    expect((await store(undefined)).status).toBe(401);
    expect((await store('not-a-real-token')).status).toBe(401);
    expect((await fetchKey(undefined)).status).toBe(401);
    expect((await fetchKey('not-a-real-token')).status).toBe(401);
  });

  test('rejects a wrap key that is not 32 bytes of base64', async () => {
    const token = await getToken();

    expect((await store(token, 'short')).status).toBe(400);
    expect(
      (await store(token, Buffer.alloc(64).toString('base64'))).status
    ).toBe(400);
  });

  test('another session of the same user gets nothing', async () => {
    const first = await getToken();

    await store(first);

    // opt into multi-session so the first token stays valid
    await tdb
      .update(users)
      .set({ allowMultipleSessions: true })
      .where(eq(users.identity, 'testowner'));

    // jwt iat has 1s resolution; a same-second login would mint the same token
    await new Promise((r) => setTimeout(r, 1100));

    const second = await getToken();

    expect(second).not.toBe(first);
    expect((await fetchKey(second)).status).toBe(404);
    expect((await fetchKey(first)).status).toBe(200);
  });

  test('logout revokes and deletes the wrap key', async () => {
    const token = await getToken();

    await store(token);
    await fetch(`${testsBaseUrl}/logout`, {
      method: 'POST',
      headers: { 'x-token': token }
    });

    expect((await fetchKey(token)).status).toBe(401);
    expect(await tdb.select().from(e2eeSessionKeys).all()).toEqual([]);
  });

  test('prune cron deletes rows whose epoch was bumped', async () => {
    const token = await getToken();

    await store(token);
    await tdb
      .update(users)
      .set({ sessionEpoch: sql`${users.sessionEpoch} + 1` })
      .where(eq(users.identity, 'testowner'));

    await pruneE2eeSessionKeys();

    expect(await tdb.select().from(e2eeSessionKeys).all()).toEqual([]);
  });
});
