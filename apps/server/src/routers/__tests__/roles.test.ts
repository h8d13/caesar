import { Permission } from '@caesar/shared';
import { initTest } from '@server/__tests__/helpers';
import { describe, expect, test } from 'vite-plus/test';

describe('roles router', () => {
  test('should throw when user lacks permissions (getAll)', async () => {
    const { caller } = await initTest(2);

    await expect(caller.roles.getAll()).rejects.toThrow(
      'Insufficient permissions'
    );
  });

  test('should throw when user lacks permissions (add)', async () => {
    const { caller } = await initTest(2);

    await expect(caller.roles.add()).rejects.toThrow(
      'Insufficient permissions'
    );
  });

  test('should throw when user lacks permissions (update)', async () => {
    const { caller } = await initTest(2);

    await expect(
      caller.roles.update({
        roleId: 2,
        name: 'Updated Role',
        color: '#ff0000',
        permissions: [Permission.SEND_MESSAGES],
        storageQuotaOverrideEnabled: false,
        storageSpaceQuota: 0
      })
    ).rejects.toThrow('Insufficient permissions');
  });

  test('should throw when user lacks permissions (delete)', async () => {
    const { caller } = await initTest(2);

    await expect(
      caller.roles.delete({
        roleId: 2
      })
    ).rejects.toThrow('Insufficient permissions');
  });

  test('should throw when user lacks permissions (setDefault)', async () => {
    const { caller } = await initTest(2);

    await expect(
      caller.roles.setDefault({
        roleId: 1
      })
    ).rejects.toThrow('Insufficient permissions');
  });

  test('should get all roles', async () => {
    const { caller } = await initTest();

    const roles = await caller.roles.getAll();

    expect(roles).toBeDefined();
    expect(Array.isArray(roles)).toBe(true);
    expect(roles.length).toBeGreaterThanOrEqual(2);
  });

  test('should create new role', async () => {
    const { caller } = await initTest();

    const roleId = await caller.roles.add();

    expect(roleId).toBeDefined();
    expect(typeof roleId).toBe('number');
    expect(roleId).toBeGreaterThan(0);

    const roles = await caller.roles.getAll();
    const newRole = roles.find((r) => r.id === roleId);

    expect(newRole).toBeDefined();
    expect(newRole!.name).toBe('New Role');
    expect(newRole!.color).toBe('#77767b');
    expect(newRole!.isDefault).toBe(false);
    expect(newRole!.isPersistent).toBe(false);
  });

  test('should update existing role', async () => {
    const { caller } = await initTest();

    const roleId = await caller.roles.add();

    await caller.roles.update({
      roleId,
      name: 'Updated Role Name',
      color: '#ff5500',
      permissions: [Permission.SEND_MESSAGES, Permission.UPLOAD_FILES],
      storageQuotaOverrideEnabled: false,
      storageSpaceQuota: 0
    });

    const roles = await caller.roles.getAll();
    const updatedRole = roles.find((r) => r.id === roleId);

    expect(updatedRole).toBeDefined();
    expect(updatedRole!.name).toBe('Updated Role Name');
    expect(updatedRole!.color).toBe('#ff5500');
    expect(updatedRole!.permissions).toContain(Permission.SEND_MESSAGES);
    expect(updatedRole!.permissions).toContain(Permission.UPLOAD_FILES);
    expect(updatedRole!.permissions.length).toBe(2);
  });

  test('should not allow updating Owner role permissions', async () => {
    const { caller } = await initTest();

    await caller.roles.update({
      roleId: 1,
      name: 'Owner',
      color: '#ff0000',
      permissions: [Permission.SEND_MESSAGES],
      storageQuotaOverrideEnabled: false,
      storageSpaceQuota: 0
    });

    const roles = await caller.roles.getAll();
    const ownerRole = roles.find((r) => r.id === 1);

    expect(ownerRole).toBeDefined();
    expect(ownerRole!.permissions.length).toBeGreaterThan(1);
  });

  test('should delete non-persistent role', async () => {
    const { caller } = await initTest();

    const roleId = await caller.roles.add();

    const rolesBefore = await caller.roles.getAll();
    expect(rolesBefore.find((r) => r.id === roleId)).toBeDefined();

    await caller.roles.delete({ roleId });

    const rolesAfter = await caller.roles.getAll();
    expect(rolesAfter.find((r) => r.id === roleId)).toBeUndefined();
  });

  test('should throw when deleting persistent role', async () => {
    const { caller } = await initTest();

    await expect(
      caller.roles.delete({
        roleId: 1
      })
    ).rejects.toThrow('Cannot delete a persistent role');
  });

  test('should throw when deleting default role', async () => {
    const { caller } = await initTest();

    const newRoleId = await caller.roles.add();
    await caller.roles.setDefault({ roleId: newRoleId });

    await expect(
      caller.roles.delete({
        roleId: newRoleId
      })
    ).rejects.toThrow('Cannot delete the default role');
  });

  test('should throw when deleting non-existing role', async () => {
    const { caller } = await initTest();

    await expect(
      caller.roles.delete({
        roleId: 999999
      })
    ).rejects.toThrow('Role not found');
  });

  test('should set new default role', async () => {
    const { caller } = await initTest();

    const newRoleId = await caller.roles.add();

    await caller.roles.setDefault({ roleId: newRoleId });

    const roles = await caller.roles.getAll();
    const newDefaultRole = roles.find((r) => r.id === newRoleId);
    const oldDefaultRole = roles.find((r) => r.id === 2);

    expect(newDefaultRole!.isDefault).toBe(true);
    expect(oldDefaultRole!.isDefault).toBe(false);
  });

  test('should throw when setting non-existing role as default', async () => {
    const { caller } = await initTest();

    await expect(
      caller.roles.setDefault({
        roleId: 999999
      })
    ).rejects.toThrow('Role not found');
  });

  test('should create multiple roles', async () => {
    const { caller } = await initTest();

    const initialRoles = await caller.roles.getAll();
    const initialCount = initialRoles.length;

    await caller.roles.add();
    await caller.roles.add();
    await caller.roles.add();

    const finalRoles = await caller.roles.getAll();

    expect(finalRoles.length).toBe(initialCount + 3);
  });

  test('should update role with empty permissions array', async () => {
    const { caller } = await initTest();

    const roleId = await caller.roles.add();

    await caller.roles.update({
      roleId,
      name: 'No Permissions Role',
      color: '#000000',
      permissions: [],
      storageQuotaOverrideEnabled: false,
      storageSpaceQuota: 0
    });

    const roles = await caller.roles.getAll();
    const role = roles.find((r) => r.id === roleId);

    expect(role).toBeDefined();
    expect(role!.permissions.length).toBe(0);
  });

  test('should update role with multiple permissions', async () => {
    const { caller } = await initTest();

    const roleId = await caller.roles.add();

    const permissions = [
      Permission.SEND_MESSAGES,
      Permission.UPLOAD_FILES,
      Permission.MANAGE_CHANNELS,
      Permission.MANAGE_ROLES
    ];

    await caller.roles.update({
      roleId,
      name: 'Multi Permission Role',
      color: '#00ff00',
      permissions,
      storageQuotaOverrideEnabled: false,
      storageSpaceQuota: 0
    });

    const roles = await caller.roles.getAll();
    const role = roles.find((r) => r.id === roleId);

    expect(role).toBeDefined();
    expect(role!.permissions.length).toBe(permissions.length);
    permissions.forEach((perm) => {
      expect(role!.permissions).toContain(perm);
    });
  });

  test('should throw when user lacks permissions (duplicate)', async () => {
    const { caller } = await initTest(2);

    await expect(caller.roles.duplicate({ roleId: 2 })).rejects.toThrow(
      'Insufficient permissions'
    );
  });

  test('should duplicate a role as a plain copy', async () => {
    const { caller } = await initTest();

    const sourceId = await caller.roles.add();

    await caller.roles.update({
      roleId: sourceId,
      name: 'A very long role name here',
      color: '#ff5500',
      permissions: [Permission.SEND_MESSAGES, Permission.UPLOAD_FILES],
      storageQuotaOverrideEnabled: true,
      storageSpaceQuota: 1024
    });

    const copyId = await caller.roles.duplicate({ roleId: sourceId });
    const roles = await caller.roles.getAll();
    const copy = roles.find((r) => r.id === copyId);

    expect(copyId).not.toBe(sourceId);
    expect(copy).toMatchObject({
      name: 'A very long role name here',
      color: '#ff5500',
      isDefault: false,
      isPersistent: false,
      storageQuotaOverrideEnabled: true,
      storageSpaceQuota: 1024
    });
    expect([...copy!.permissions].sort()).toEqual(
      [Permission.SEND_MESSAGES, Permission.UPLOAD_FILES].sort()
    );
  });

  test('should duplicate the default role without making it default', async () => {
    const { caller } = await initTest();

    const roles = await caller.roles.getAll();
    const member = roles.find((r) => r.isDefault)!;

    const copyId = await caller.roles.duplicate({ roleId: member.id });
    const copy = (await caller.roles.getAll()).find((r) => r.id === copyId);

    expect(copy!.name).toBe(`${member.name} copy`);
    expect(copy!.isDefault).toBe(false);
    expect([...copy!.permissions].sort()).toEqual(
      [...member.permissions].sort()
    );
  });

  test('should not duplicate the owner role', async () => {
    const { caller } = await initTest();

    await expect(caller.roles.duplicate({ roleId: 1 })).rejects.toThrow(
      'The owner role cannot be duplicated'
    );
  });
});
