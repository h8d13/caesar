import { sha256 } from '@caesar/shared';
import { logins, users } from '@caesar/shared/db/schema';
import { initTest, login } from '@server/__tests__/helpers';
import { TEST_SECRET_TOKEN } from '@server/__tests__/seed';
import { tdb } from '@server/__tests__/setup';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

const epochFor = async (userId: number): Promise<number> => {
  const row = await tdb
    .select({ sessionEpoch: users.sessionEpoch })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return row?.sessionEpoch ?? 0;
};

const allowMultipleSessionsFor = async (userId: number): Promise<boolean> => {
  const row = await tdb
    .select({ allowMultipleSessions: users.allowMultipleSessions })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return row?.allowMultipleSessions ?? false;
};

describe('users.setAllowMultipleSessions', () => {
  test('persists the flag and the join response carries it back to self only', async () => {
    const { caller } = await initTest(1);

    expect(await allowMultipleSessionsFor(1)).toBe(false);

    await caller.users.setAllowMultipleSessions({ value: true });

    expect(await allowMultipleSessionsFor(1)).toBe(true);

    const reJoined = await initTest(1);
    const ownRow = reJoined.initialData.users.find((u) => u.id === 1);
    expect(ownRow?.allowMultipleSessions).toBe(true);

    // peers must not see the flag.
    const peerRow = reJoined.initialData.users.find((u) => u.id === 2);
    expect(peerRow?.allowMultipleSessions).toBeUndefined();
  });

  test('toggling back to false flips the flag', async () => {
    const { caller } = await initTest(1);
    await caller.users.setAllowMultipleSessions({ value: true });
    await caller.users.setAllowMultipleSessions({ value: false });
    expect(await allowMultipleSessionsFor(1)).toBe(false);
  });
});

describe('/login epoch behavior with allowMultipleSessions', () => {
  test('default (false) bumps sessionEpoch on each login', async () => {
    const before = await epochFor(1);

    const response = await login('testowner', 'password123');
    expect(response.status).toBe(200);

    const after = await epochFor(1);
    expect(after).toBe(before + 1);
  });

  test('with flag on, sessionEpoch stays put across logins', async () => {
    const { caller } = await initTest(1);
    await caller.users.setAllowMultipleSessions({ value: true });

    const before = await epochFor(1);

    const response = await login('testowner', 'password123');
    expect(response.status).toBe(200);

    const after = await epochFor(1);
    expect(after).toBe(before);

    // and the minted token carries that same (un-bumped) epoch
    const data = (await response.json()) as { token: string };
    const decoded = jwt.verify(data.token, await sha256(TEST_SECRET_TOKEN));
    expect((decoded as { sessionEpoch: number }).sessionEpoch).toBe(before);
  });
});

describe('users.signOutOtherSessions', () => {
  test('bumps sessionEpoch regardless of the multi-session flag', async () => {
    const { caller } = await initTest(1);
    await caller.users.setAllowMultipleSessions({ value: true });

    const before = await epochFor(1);

    await caller.users.signOutOtherSessions();

    const after = await epochFor(1);
    expect(after).toBe(before + 1);
  });

  test('returns a fresh JWT minted at the new epoch', async () => {
    const { caller } = await initTest(1);

    const { token } = await caller.users.signOutOtherSessions();
    const decoded = jwt.verify(token, await sha256(TEST_SECRET_TOKEN));

    const epochNow = await epochFor(1);
    expect((decoded as { sessionEpoch: number }).sessionEpoch).toBe(epochNow);
    expect((decoded as { userId: number }).userId).toBe(1);
  });
});

describe('users.renameIdentity', () => {
  test('admin can rename a peer; mirrors name when it equaled identity', async () => {
    const { caller: adminCaller } = await initTest(1);

    // align name with identity to mirror the post-signup default state
    // (login.ts seeds `name: identity` on signup).
    await tdb.update(users).set({ name: 'testuser' }).where(eq(users.id, 2));

    await adminCaller.users.renameIdentity({
      userId: 2,
      identity: 'renamed-user'
    });

    const row = await tdb
      .select({ identity: users.identity, name: users.name })
      .from(users)
      .where(eq(users.id, 2))
      .get();

    expect(row?.identity).toBe('renamed-user');
    expect(row?.name).toBe('renamed-user');
  });

  test('preserves custom display name when it differs from old identity', async () => {
    const { caller: adminCaller } = await initTest(1);

    await tdb
      .update(users)
      .set({ name: 'Custom Display' })
      .where(eq(users.id, 2));

    await adminCaller.users.renameIdentity({
      userId: 2,
      identity: 'renamed-again'
    });

    const row = await tdb
      .select({ identity: users.identity, name: users.name })
      .from(users)
      .where(eq(users.id, 2))
      .get();

    expect(row?.identity).toBe('renamed-again');
    expect(row?.name).toBe('Custom Display');
  });

  test('bumps target user`s sessionEpoch so existing JWTs invalidate', async () => {
    const { caller: adminCaller } = await initTest(1);
    const before = await epochFor(2);

    await adminCaller.users.renameIdentity({
      userId: 2,
      identity: 'rename-epoch-test'
    });

    const after = await epochFor(2);
    expect(after).toBe(before + 1);
  });

  test('rejects malformed identities (leading symbol, spaces, etc.)', async () => {
    const { caller: adminCaller } = await initTest(1);

    for (const bad of ["' or '1'='1", '-leading', '@nope', 'has space']) {
      await expect(
        adminCaller.users.renameIdentity({ userId: 2, identity: bad })
      ).rejects.toThrow(/letters/);
    }
  });

  test('rejects taking an identity already in use', async () => {
    const { caller: adminCaller } = await initTest(1);

    // testowner already exists (id=1)
    await expect(
      adminCaller.users.renameIdentity({ userId: 2, identity: 'testowner' })
    ).rejects.toThrow(/already taken/);
  });

  test('non-admins cannot rename anyone', async () => {
    const { caller: nonAdmin } = await initTest(2);

    await expect(
      nonAdmin.users.renameIdentity({ userId: 1, identity: 'hack' })
    ).rejects.toThrow();
  });
});

describe('users.getMySessions', () => {
  test('returns sha256(userAgent)[:8] + createdAt for the caller, ordered newest first', async () => {
    const { caller } = await initTest(1);

    const now = Date.now();
    await tdb.insert(logins).values([
      {
        userId: 1,
        userAgent: 'Mozilla/5.0 testbrowser-a',
        os: 'Linux',
        device: 'Desktop',
        ip: 'hashed-ip',
        createdAt: now - 1000
      },
      {
        userId: 1,
        userAgent: 'Mozilla/5.0 testbrowser-b',
        os: 'Linux',
        device: 'Desktop',
        ip: 'hashed-ip',
        createdAt: now
      }
    ]);

    const sessions = await caller.users.getMySessions();

    expect(sessions.length).toBeGreaterThanOrEqual(2);
    // newest-first ordering.
    expect(sessions[0]!.createdAt).toBeGreaterThanOrEqual(
      sessions[1]!.createdAt
    );

    // shape: only hash + createdAt, nothing else (no ip, no userAgent).
    expect(Object.keys(sessions[0]!).sort()).toEqual(
      ['createdAt', 'hash'].sort()
    );
    expect(sessions[0]!.hash).toMatch(/^[0-9a-f]{8}$/);

    // same userAgent -> same hash; different userAgent -> different hash.
    const expectedA = (await sha256('Mozilla/5.0 testbrowser-a')).slice(0, 8);
    const expectedB = (await sha256('Mozilla/5.0 testbrowser-b')).slice(0, 8);
    const hashes = sessions.map((s) => s.hash);
    expect(hashes).toContain(expectedA);
    expect(hashes).toContain(expectedB);
  });

  test('returns at most 10 rows even with more in the table', async () => {
    const { caller } = await initTest(1);

    const now = Date.now();
    const rows = Array.from({ length: 15 }, (_, i) => ({
      userId: 1,
      userAgent: `ua-${i}`,
      os: 'Linux',
      device: 'Desktop',
      ip: 'hashed-ip',
      createdAt: now - i * 1000
    }));

    await tdb.insert(logins).values(rows);

    const sessions = await caller.users.getMySessions();
    expect(sessions.length).toBe(10);
  });

  test('only returns the caller`s own logins', async () => {
    const { caller: caller1 } = await initTest(1);

    await tdb.insert(logins).values({
      userId: 2,
      userAgent: 'other-user-ua',
      os: 'Linux',
      device: 'Desktop',
      ip: 'hashed-ip',
      createdAt: Date.now()
    });

    const sessions = await caller1.users.getMySessions();
    const otherHash = (await sha256('other-user-ua')).slice(0, 8);
    expect(sessions.map((s) => s.hash)).not.toContain(otherHash);
  });
});
