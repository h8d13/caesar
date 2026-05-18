import { initTest } from '@server/__tests__/helpers';
import { describe, expect, test } from 'bun:test';

describe('users.setAppearOffline', () => {
  test('persists the flag and surfaces it on the next joinServer for self', async () => {
    const { caller } = await initTest(1);

    await caller.users.setAppearOffline({ value: true });

    // simulate a re-login: a fresh joinServer call.
    const reJoined = await initTest(1);
    const ownRow = reJoined.initialData.users.find((u) => u.id === 1);

    expect(ownRow).toBeDefined();
    expect(ownRow?.appearOffline).toBe(true);
  });

  test('strips appearOffline from peer rows in the join response', async () => {
    const { caller } = await initTest(2);
    await caller.users.setAppearOffline({ value: true });

    // user 1 logs in and sees user 2 (who is appearing offline).
    const { initialData } = await initTest(1);
    const peerRow = initialData.users.find((u) => u.id === 2);

    expect(peerRow).toBeDefined();
    expect(peerRow?.appearOffline).toBeUndefined();
    // status should be masked OFFLINE for peers
    expect(peerRow?.status).toBe('offline');
  });

  test('toggling back to false flips the flag', async () => {
    const { caller } = await initTest(3);

    await caller.users.setAppearOffline({ value: true });
    await caller.users.setAppearOffline({ value: false });

    const reJoined = await initTest(3);
    const ownRow = reJoined.initialData.users.find((u) => u.id === 3);

    expect(ownRow?.appearOffline).toBe(false);
  });
});
