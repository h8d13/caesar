import { pushSubscriptions } from '@caesar/shared/db/schema';
import { initTest } from '@server/__tests__/helpers';
import { db } from '@server/db';
import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';

const SUB = {
  endpoint: 'https://push.example.com/sub/abc123',
  p256dh: 'p256dh-key',
  auth: 'auth-secret',
  notifyAll: true,
  notifyMentions: false,
  notifyDms: false
};

describe('push router', () => {
  test('should store a subscription with prefs', async () => {
    const { caller } = await initTest();

    await caller.push.subscribe(SUB);

    const row = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, SUB.endpoint))
      .get();

    expect(row).toBeDefined();
    expect(row!.userId).toBe(1);
    expect(row!.notifyAll).toBe(true);
    expect(row!.notifyMentions).toBe(false);
    expect(row!.notifyDms).toBe(false);
  });

  test('should upsert prefs on re-subscribe with the same endpoint', async () => {
    const { caller } = await initTest();

    await caller.push.subscribe(SUB);
    await caller.push.subscribe({
      ...SUB,
      notifyAll: false,
      notifyDms: true
    });

    const rows = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, SUB.endpoint));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.notifyAll).toBe(false);
    expect(rows[0]!.notifyDms).toBe(true);
  });

  test('should remove the subscription on unsubscribe', async () => {
    const { caller } = await initTest();

    await caller.push.subscribe(SUB);
    await caller.push.unsubscribe({ endpoint: SUB.endpoint });

    const row = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, SUB.endpoint))
      .get();

    expect(row).toBeUndefined();
  });

  test('should not remove another user subscription on unsubscribe', async () => {
    const { caller: owner } = await initTest();

    await owner.push.subscribe(SUB);

    const { caller: other } = await initTest(2);

    await other.push.unsubscribe({ endpoint: SUB.endpoint });

    const row = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, SUB.endpoint))
      .get();

    expect(row).toBeDefined();
  });
});
