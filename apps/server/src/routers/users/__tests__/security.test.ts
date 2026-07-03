import { OWNER_ROLE_ID, Permission, sha256 } from '@caesar/shared';
import { logins, userRoles, users } from '@caesar/shared/db/schema';
import { initTest, login } from '@server/__tests__/helpers';
import { tdb } from '@server/__tests__/setup';
import { getJwtSecret } from '@server/utils/jwt-secret';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { describe, expect, test } from 'vitest';

// Stand up a non-owner moderator: user 2 gets a fresh role carrying only the
// listed permissions, then acts via their own caller. `initTest(2)` must run
// AFTER the role is assigned so the permission middleware sees it live.
const makeModerator = async (
  ownerCaller: Awaited<ReturnType<typeof initTest>>['caller'],
  permissions: Permission[] = [Permission.MANAGE_USERS]
) => {
  const roleId = await ownerCaller.roles.add();

  await ownerCaller.roles.update({
    roleId,
    name: 'Moderator',
    color: '#123456',
    permissions,
    storageQuotaOverrideEnabled: false,
    storageSpaceQuota: 0
  });

  await ownerCaller.users.addRole({ userId: 2, roleId });

  return initTest(2);
};

const insertUser = async (identity: string): Promise<number> => {
  const row = await tdb
    .insert(users)
    .values({
      identity,
      name: identity,
      avatarId: null,
      password: 'password',
      bannerId: null,
      bio: null,
      bannerColor: null,
      createdAt: Date.now()
    })
    .returning({ id: users.id })
    .get();

  return row!.id;
};

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
    const decoded = jwt.verify(data.token, await getJwtSecret());
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
    const decoded = jwt.verify(token, await getJwtSecret());

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

// The owner user (id 1, holds OWNER_ROLE_ID) must be untouchable by a
// non-owner moderator, even one holding MANAGE_USERS. Ban locks the owner
// out with no self-recovery; delete is irreversible.
describe('owner-account protection', () => {
  test('a MANAGE_USERS moderator cannot ban the owner', async () => {
    const { caller: owner } = await initTest(1);
    const { caller: mod } = await makeModerator(owner);

    await expect(mod.users.ban({ userId: 1 })).rejects.toThrow(
      /cannot ban the server owner/i
    );

    const row = await tdb
      .select({ banned: users.banned })
      .from(users)
      .where(eq(users.id, 1))
      .get();
    expect(row?.banned).toBeFalsy();
  });

  test('a MANAGE_USERS moderator cannot delete the owner', async () => {
    const { caller: owner } = await initTest(1);
    const { caller: mod } = await makeModerator(owner);

    await expect(mod.users.delete({ userId: 1, wipe: true })).rejects.toThrow(
      /cannot delete the server owner/i
    );

    const row = await tdb
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, 1))
      .get();
    expect(row?.id).toBe(1);
  });

  test('a MANAGE_USERS moderator cannot kick the owner', async () => {
    const { caller: owner } = await initTest(1);
    const { caller: mod } = await makeModerator(owner);

    // Guard fires before the "user not connected" check.
    await expect(mod.users.kick({ userId: 1 })).rejects.toThrow(
      /cannot kick the server owner/i
    );
  });

  test('a MANAGE_USERS moderator cannot rename the owner identity', async () => {
    const { caller: owner } = await initTest(1);
    const { caller: mod } = await makeModerator(owner);

    await expect(
      mod.users.renameIdentity({ userId: 1, identity: 'stolen-owner' })
    ).rejects.toThrow(/cannot rename the server owner/i);
  });

  test('the guard protects only the owner: a moderator can still ban a peer', async () => {
    const { caller: owner } = await initTest(1);
    const { caller: mod } = await makeModerator(owner);
    const targetId = await insertUser('peer-target');

    await mod.users.ban({ userId: targetId });

    const row = await tdb
      .select({ banned: users.banned })
      .from(users)
      .where(eq(users.id, targetId))
      .get();
    expect(row?.banned).toBe(true);
  });
});

// MANAGE_USERS lets a moderator assign roles, but not roles carrying
// permissions the moderator lacks: otherwise MANAGE_USERS self-escalates to
// full admin. Owner bypasses.
describe('role-assignment escalation', () => {
  test('a MANAGE_USERS moderator cannot assign a role granting MANAGE_ROLES', async () => {
    const { caller: owner } = await initTest(1);
    const { caller: mod } = await makeModerator(owner);

    const adminRoleId = await owner.roles.add();
    await owner.roles.update({
      roleId: adminRoleId,
      name: 'Admin',
      color: '#abcdef',
      permissions: [Permission.MANAGE_ROLES, Permission.MANAGE_SETTINGS],
      storageQuotaOverrideEnabled: false,
      storageSpaceQuota: 0
    });

    const targetId = await insertUser('escalation-target');

    await expect(
      mod.users.addRole({ userId: targetId, roleId: adminRoleId })
    ).rejects.toThrow(/permissions you do not have/i);

    const assigned = await tdb
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(eq(userRoles.userId, targetId))
      .all();
    expect(assigned.map((r) => r.roleId)).not.toContain(adminRoleId);
  });

  test('a moderator can assign a role whose permissions it already holds', async () => {
    const { caller: owner } = await initTest(1);
    const { caller: mod } = await makeModerator(owner);

    // MANAGE_USERS is a permission the moderator holds, so it may pass it on.
    const peerModRoleId = await owner.roles.add();
    await owner.roles.update({
      roleId: peerModRoleId,
      name: 'Peer Mod',
      color: '#00ff00',
      permissions: [Permission.MANAGE_USERS],
      storageQuotaOverrideEnabled: false,
      storageSpaceQuota: 0
    });

    const targetId = await insertUser('allowed-target');

    await mod.users.addRole({ userId: targetId, roleId: peerModRoleId });

    const assigned = await tdb
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(eq(userRoles.userId, targetId))
      .all();
    expect(assigned.map((r) => r.roleId)).toContain(peerModRoleId);
  });

  test('the owner can still assign any role', async () => {
    const { caller: owner } = await initTest(1);

    const adminRoleId = await owner.roles.add();
    await owner.roles.update({
      roleId: adminRoleId,
      name: 'Admin',
      color: '#abcdef',
      permissions: [Permission.MANAGE_ROLES, Permission.MANAGE_SETTINGS],
      storageQuotaOverrideEnabled: false,
      storageSpaceQuota: 0
    });

    const targetId = await insertUser('owner-grant-target');

    await owner.users.addRole({ userId: targetId, roleId: adminRoleId });

    const assigned = await tdb
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(eq(userRoles.userId, targetId))
      .all();
    expect(assigned.map((r) => r.roleId)).toContain(adminRoleId);
  });
});
