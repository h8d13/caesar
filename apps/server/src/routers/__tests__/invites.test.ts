import { ActivityLogType, OWNER_ROLE_ID } from '@caesar/shared';
import { roles, users } from '@caesar/shared/db/schema';
import { initTest, login } from '@server/__tests__/helpers';
import { tdb } from '@server/__tests__/setup';
import { eq } from 'drizzle-orm';
import { describe, expect, test, vi } from 'vite-plus/test';

// seeded non-persistent role, safe to hand out by invite
const getGuestRoleId = async () => {
  const guest = await tdb
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, 'Guest'))
    .get();

  return guest!.id;
};

describe('invites router', () => {
  test('should throw when user lacks permissions (getAll)', async () => {
    const { caller } = await initTest(2);

    await expect(caller.invites.getAll()).rejects.toThrow(
      'Insufficient permissions'
    );
  });

  test('should throw when user lacks permissions (add)', async () => {
    const { caller } = await initTest(2);

    await expect(
      caller.invites.add({
        maxUses: 10
      })
    ).rejects.toThrow('Insufficient permissions');
  });

  test('should throw when user lacks permissions (delete)', async () => {
    const { caller } = await initTest(2);

    await expect(
      caller.invites.delete({
        inviteId: 1
      })
    ).rejects.toThrow('Insufficient permissions');
  });

  test('should get all invites', async () => {
    const { caller } = await initTest();

    const invites = await caller.invites.getAll();

    expect(invites).toBeDefined();
    expect(Array.isArray(invites)).toBe(true);
  });

  test('should create new invite with default values', async () => {
    const { caller } = await initTest();

    await caller.invites.add({});

    const invites = await caller.invites.getAll();

    expect(invites.length).toBeGreaterThan(0);

    const newInvite = invites[invites.length - 1];
    expect(newInvite).toBeDefined();
    expect(newInvite!.code).toBeDefined();
    expect(newInvite!.code.length).toBeGreaterThan(0);
    expect(newInvite!.maxUses).toBeNull();
    expect(newInvite!.uses).toBe(0);
    expect(newInvite!.expiresAt).toBeNull();
  });

  test('should create new invite with custom maxUses', async () => {
    const { caller } = await initTest();

    await caller.invites.add({
      maxUses: 5
    });

    const invites = await caller.invites.getAll();
    const newInvite = invites[invites.length - 1];

    expect(newInvite).toBeDefined();
    expect(newInvite!.maxUses).toBe(5);
  });

  test('should generate a random code per invite', async () => {
    const { caller } = await initTest();

    const inviteA = await caller.invites.add({});
    const inviteB = await caller.invites.add({});

    expect(inviteA.code).toBeTruthy();
    expect(inviteB.code).toBeTruthy();
    expect(inviteA.code).not.toBe(inviteB.code);
    expect(inviteA.code.length).toBe(24);
  });

  test('should create new invite with expiration', async () => {
    const { caller } = await initTest();

    const expiresAt = Date.now() + 86400000; // 1 day from now

    await caller.invites.add({
      expiresAt
    });

    const invites = await caller.invites.getAll();
    const newInvite = invites[invites.length - 1];

    expect(newInvite).toBeDefined();
    expect(newInvite!.expiresAt).toBe(expiresAt);
  });

  test('should delete existing invite', async () => {
    const { caller } = await initTest();

    const created = await caller.invites.add({});

    const invitesBefore = await caller.invites.getAll();
    const inviteToDelete = invitesBefore.find((i) => i.code === created.code);

    expect(inviteToDelete).toBeDefined();

    await caller.invites.delete({
      inviteId: inviteToDelete!.id
    });

    const invitesAfter = await caller.invites.getAll();
    const deletedInvite = invitesAfter.find((i) => i.code === created.code);

    expect(deletedInvite).toBeUndefined();
  });

  test('should throw error when deleting non-existing invite', async () => {
    const { caller } = await initTest();

    await expect(
      caller.invites.delete({
        inviteId: 999999
      })
    ).rejects.toThrow('Invite not found');
  });

  test('should create multiple invites', async () => {
    const { caller } = await initTest();

    const initialInvites = await caller.invites.getAll();
    const initialCount = initialInvites.length;

    await caller.invites.add({});
    await caller.invites.add({});
    await caller.invites.add({});

    const finalInvites = await caller.invites.getAll();

    expect(finalInvites.length).toBe(initialCount + 3);
  });

  test('should create invite with a valid roleId', async () => {
    const { caller } = await initTest();
    const guestId = await getGuestRoleId();

    const invite = await caller.invites.add({
      roleId: guestId
    });

    expect(invite).toBeDefined();
    expect(invite.roleId).toBe(guestId);
  });

  test('should refuse invites into the owner role, even for the owner', async () => {
    const { caller } = await initTest();

    await expect(caller.invites.add({ roleId: OWNER_ROLE_ID })).rejects.toThrow(
      'Invites cannot grant the owner role'
    );
  });

  test('should throw error when creating invite with invalid roleId', async () => {
    const { caller } = await initTest();

    await expect(
      caller.invites.add({
        roleId: 999999
      })
    ).rejects.toThrow('Role not found');
  });

  test('should return role info in getAll for invite with roleId', async () => {
    const { caller } = await initTest();

    const guestId = await getGuestRoleId();
    const created = await caller.invites.add({
      roleId: guestId
    });

    const invites = await caller.invites.getAll();
    const inviteWithRole = invites.find((i) => i.code === created.code);

    expect(inviteWithRole).toBeDefined();
    expect(inviteWithRole!.role).toBeDefined();
    expect(inviteWithRole!.role).not.toBeNull();
    expect(inviteWithRole!.role!.id).toBe(guestId);
    expect(inviteWithRole!.role!.name).toBeDefined();
    expect(inviteWithRole!.role!.color).toBeDefined();
  });

  test('should return null role for invite without roleId', async () => {
    const { caller } = await initTest();

    const created = await caller.invites.add({});

    const invites = await caller.invites.getAll();
    const inviteWithoutRole = invites.find((i) => i.code === created.code);

    expect(inviteWithoutRole).toBeDefined();
    expect(inviteWithoutRole!.role).toBeNull();
  });

  test('should rate limit excessive add invite attempts', async () => {
    const { caller } = await initTest(1);

    for (let i = 0; i < 10; i++) {
      await caller.invites.add({});
    }

    await expect(caller.invites.add({})).rejects.toThrow(
      'Too many requests. Please try again shortly.'
    );
  });

  test('should throw when user lacks permissions (getLog)', async () => {
    const { caller } = await initTest(2);

    await expect(caller.invites.getLog()).rejects.toThrow(
      'Insufficient permissions'
    );
  });

  test('should log created, used and deleted invites', async () => {
    const { caller } = await initTest();

    const invite = await caller.invites.add({});
    const response = await login('loguser', 'password123', invite.code);

    expect(response.status).toBe(200);

    await caller.invites.delete({ inviteId: invite.id });

    const newUser = await tdb
      .select({ id: users.id })
      .from(users)
      .where(eq(users.identity, 'loguser'))
      .get();

    // the activity log is written through an async queue
    await vi.waitFor(async () => {
      const log = await caller.invites.getLog();

      expect(log).toHaveLength(3);
      expect(log).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: ActivityLogType.CREATED_INVITE,
            userId: 1,
            details: expect.objectContaining({ code: invite.code })
          }),
          expect.objectContaining({
            type: ActivityLogType.USED_INVITE,
            userId: newUser!.id,
            details: { code: invite.code, inviterId: 1 }
          }),
          expect.objectContaining({
            type: ActivityLogType.DELETED_INVITE,
            userId: 1,
            details: { code: invite.code }
          })
        ])
      );
    });
  });
});
