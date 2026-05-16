import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { initTest } from '../../__tests__/helpers';
import { tdb } from '../../__tests__/setup';
import { pruneExpiredMessages } from '../../crons/prune-expired';
import { messages, settings } from '../../db/schema';

describe('dms router', () => {
  test('should create a direct message channel and allow messaging', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller2 } = await initTest(2);

    const { channelId } = await caller1.dms.open({ userId: 2 });

    await caller1.messages.send({
      channelId,
      content: 'hello dm',
      files: []
    });

    const page = await caller2.messages.get({
      channelId,
      cursor: null,
      limit: 50
    });

    expect(page.messages.length).toBe(1);
    expect(page.messages[0]!.content).toBe('hello dm');
  });

  test('should reuse existing direct message channel for same pair', async () => {
    const { caller } = await initTest(1);

    const first = await caller.dms.open({ userId: 2 });
    const second = await caller.dms.open({ userId: 2 });

    expect(second.channelId).toBe(first.channelId);
  });

  test('should list direct message conversations', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller2 } = await initTest(2);

    const { channelId } = await caller1.dms.open({ userId: 2 });

    await caller1.messages.send({
      channelId,
      content: 'list dm',
      files: []
    });

    const list1 = await caller1.dms.get();
    const list2 = await caller2.dms.get();

    expect(
      list1.some((dm) => dm.channelId === channelId && dm.userId === 2)
    ).toBe(true);
    expect(
      list2.some((dm) => dm.channelId === channelId && dm.userId === 1)
    ).toBe(true);
  });

  test('should reject creating direct message with self', async () => {
    const { caller } = await initTest(1);

    await expect(caller.dms.open({ userId: 1 })).rejects.toThrow(
      'Cannot create a direct message with yourself'
    );
  });

  test('ephemeral mode: default null, set/get round-trips, validates duration', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller2 } = await initTest(2);

    const { channelId } = await caller1.dms.open({ userId: 2 });

    const initial = await caller1.dms.getEphemeral({ channelId });
    expect(initial.ephemeralMs).toBeNull();

    await caller1.dms.setEphemeral({
      channelId,
      ephemeralMs: 60 * 60 * 1000
    });

    const afterSet = await caller2.dms.getEphemeral({ channelId });
    expect(afterSet.ephemeralMs).toBe(60 * 60 * 1000);

    await caller1.dms.setEphemeral({ channelId, ephemeralMs: null });
    const afterClear = await caller1.dms.getEphemeral({ channelId });
    expect(afterClear.ephemeralMs).toBeNull();

    await expect(
      caller1.dms.setEphemeral({ channelId, ephemeralMs: 12345 })
    ).rejects.toThrow('Invalid ephemeral duration');
  });

  test('ephemeral mode: non-participant cannot read or set', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller3 } = await initTest(3);

    const { channelId } = await caller1.dms.open({ userId: 2 });

    await expect(caller3.dms.getEphemeral({ channelId })).rejects.toThrow(
      'You are not a participant in this DM channel'
    );

    await expect(
      caller3.dms.setEphemeral({
        channelId,
        ephemeralMs: 60 * 60 * 1000
      })
    ).rejects.toThrow('You are not a participant in this DM channel');
  });

  test('ephemeral mode: messages get expiresAt and prune cron deletes them', async () => {
    const { caller: caller1 } = await initTest(1);
    await initTest(2);

    const { channelId } = await caller1.dms.open({ userId: 2 });

    // baseline: no ephemeral set, no expiresAt
    await caller1.messages.send({
      channelId,
      content: 'plain',
      files: []
    });

    const beforeEphemeral = await tdb
      .select()
      .from(messages)
      .where(eq(messages.channelId, channelId))
      .all();
    expect(beforeEphemeral.length).toBe(1);
    expect(beforeEphemeral[0]!.expiresAt).toBeNull();

    // turn on 1h ephemeral, new message gets expiresAt ~now+1h
    const ONE_HOUR = 60 * 60 * 1000;
    await caller1.dms.setEphemeral({ channelId, ephemeralMs: ONE_HOUR });

    const before = Date.now();
    await caller1.messages.send({
      channelId,
      content: 'ephemeral',
      files: []
    });
    const after = Date.now();

    const ephemeralRow = await tdb
      .select()
      .from(messages)
      .where(eq(messages.content, 'ephemeral'))
      .get();

    expect(ephemeralRow).toBeTruthy();
    expect(ephemeralRow!.expiresAt).not.toBeNull();
    expect(ephemeralRow!.expiresAt!).toBeGreaterThanOrEqual(before + ONE_HOUR);
    expect(ephemeralRow!.expiresAt!).toBeLessThanOrEqual(after + ONE_HOUR);

    // force expire and run prune cron
    await tdb
      .update(messages)
      .set({ expiresAt: Date.now() - 1000 })
      .where(eq(messages.id, ephemeralRow!.id))
      .execute();

    await pruneExpiredMessages();

    const afterPrune = await tdb
      .select()
      .from(messages)
      .where(eq(messages.id, ephemeralRow!.id))
      .all();
    expect(afterPrune.length).toBe(0);

    // non-ephemeral message untouched
    const survivor = await tdb
      .select()
      .from(messages)
      .where(eq(messages.content, 'plain'))
      .get();
    expect(survivor).toBeTruthy();
  });

  test('ephemeral mode: only DM channels accept set', async () => {
    const { caller } = await initTest(1);

    await expect(
      caller.dms.setEphemeral({
        channelId: 1,
        ephemeralMs: 60 * 60 * 1000
      })
    ).rejects.toThrow('Ephemeral mode is only supported on DM channels');
  });

  test('should reject open and list when direct messages are disabled', async () => {
    const { caller } = await initTest(1);

    await tdb
      .update(settings)
      .set({
        directMessagesEnabled: false
      })
      .execute();

    await expect(caller.dms.open({ userId: 2 })).rejects.toThrow(
      'Direct messages are disabled on this server'
    );

    await expect(caller.dms.get()).rejects.toThrow(
      'Direct messages are disabled on this server'
    );
  });
});
