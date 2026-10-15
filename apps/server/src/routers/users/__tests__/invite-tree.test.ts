import { DELETED_USER_IDENTITY_AND_NAME, Permission } from '@caesar/shared';
import {
  invites,
  rolePermissions,
  roles,
  userRoles,
  users
} from '@caesar/shared/db/schema';
import { initTest, login } from '@server/__tests__/helpers';
import { tdb } from '@server/__tests__/setup';
import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'vite-plus/test';

// Signs a new user up through a fresh invite created by creatorId.
const signupVia = async (creatorId: number, identity: string) => {
  const code = `INV-${identity}`;

  await tdb.insert(invites).values({
    code,
    creatorId,
    createdAt: Date.now()
  });

  const response = await login(identity, 'password123', code);

  expect(response.status).toBe(200);

  const user = await tdb
    .select({
      id: users.id,
      invitedBy: users.invitedBy,
      inviteCode: users.inviteCode
    })
    .from(users)
    .where(eq(users.identity, identity))
    .get();

  return user!;
};

// owner(1) -> a -> b -> c
const seedChain = async () => {
  const a = await signupVia(1, 'chaina');
  const b = await signupVia(a.id, 'chainb');
  const c = await signupVia(b.id, 'chainc');

  return { a, b, c };
};

const grantRole = async (userId: number, permissions: Permission[]) => {
  const [role] = await tdb
    .insert(roles)
    .values({
      name: 'Moderator',
      color: '#00ff00',
      isPersistent: false,
      isDefault: false,
      createdAt: Date.now()
    })
    .returning();

  await tdb.insert(rolePermissions).values(
    permissions.map((permission) => ({
      roleId: role!.id,
      permission,
      createdAt: Date.now()
    }))
  );

  await tdb.insert(userRoles).values({
    userId,
    roleId: role!.id,
    createdAt: Date.now()
  });
};

const getInvitedBy = async (userId: number) =>
  (
    await tdb
      .select({ invitedBy: users.invitedBy })
      .from(users)
      .where(eq(users.id, userId))
      .get()
  )?.invitedBy;

describe('invite provenance', () => {
  test('signup through an invite records inviter and code', async () => {
    const user = await signupVia(2, 'invitee');

    expect(user.invitedBy).toBe(2);
    expect(user.inviteCode).toBe('INV-invitee');
  });

  test('seeded genesis owner has no inviter', async () => {
    expect(await getInvitedBy(1)).toBeNull();
  });

  test('deleting the invite keeps the link', async () => {
    const { caller } = await initTest();
    const user = await signupVia(2, 'invitee');

    await tdb.delete(invites).where(eq(invites.code, 'INV-invitee'));

    const info = await caller.users.getInfo({ userId: user.id });

    expect(info.invitedBy).toEqual({ id: 2, name: 'Test User' });
    expect(info.inviteCode).toBe('INV-invitee');
  });

  test.each([false, true])(
    'deleting the inviter (wipe=%s) re-points invitees to the placeholder',
    async (wipe) => {
      const { caller } = await initTest();
      const user = await signupVia(2, 'invitee');

      await caller.users.delete({ userId: 2, wipe });

      const placeholder = await tdb
        .select({ id: users.id })
        .from(users)
        .where(eq(users.identity, DELETED_USER_IDENTITY_AND_NAME))
        .get();

      expect(placeholder).toBeDefined();
      expect(await getInvitedBy(user.id)).toBe(placeholder!.id);
    }
  );
});

describe('users.getInviteTree', () => {
  test('requires MANAGE_USERS', async () => {
    const { caller } = await initTest(2);

    await expect(
      caller.users.getInviteTree({ userId: 1, direction: 'down' })
    ).rejects.toThrow('Insufficient permissions');
  });

  test('walks up to genesis', async () => {
    const { caller } = await initTest();
    const { a, b, c } = await seedChain();

    const nodes = await caller.users.getInviteTree({
      userId: c.id,
      direction: 'up'
    });

    expect(nodes.map((n) => [n.id, n.depth])).toEqual([
      [b.id, 1],
      [a.id, 2],
      [1, 3]
    ]);
  });

  test('walks down the whole branch', async () => {
    const { caller } = await initTest();
    const { a, b, c } = await seedChain();
    const sibling = await signupVia(a.id, 'sibling');

    const nodes = await caller.users.getInviteTree({
      userId: a.id,
      direction: 'down'
    });

    expect(nodes.map((n) => [n.id, n.depth])).toEqual([
      [b.id, 1],
      [sibling.id, 1],
      [c.id, 2]
    ]);
  });

  test('maxDepth caps the walk', async () => {
    const { caller } = await initTest();
    const { b } = await seedChain();

    const nodes = await caller.users.getInviteTree({
      userId: 1,
      direction: 'down',
      maxDepth: 2
    });

    expect(nodes.map((n) => n.depth)).toEqual([1, 2]);
    expect(nodes.at(-1)!.id).toBe(b.id);
  });

  test('strips identity and codes without their permissions', async () => {
    await grantRole(2, [Permission.MANAGE_USERS]);

    const { caller } = await initTest(2);
    const { a } = await seedChain();

    const nodes = await caller.users.getInviteTree({
      userId: 1,
      direction: 'down',
      maxDepth: 1
    });

    expect(nodes).toEqual([
      {
        id: a.id,
        name: 'chaina',
        identity: null,
        invitedBy: 1,
        inviteCode: null,
        depth: 1
      }
    ]);

    const info = await caller.users.getInfo({ userId: a.id });

    expect(info.invitedBy).toEqual({ id: 1, name: 'Test Owner' });
    expect(info.inviteCode).toBeNull();
  });
});
