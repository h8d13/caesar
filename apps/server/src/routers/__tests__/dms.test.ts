import { messages, settings } from '@caesar/shared/db/schema';
import { initTest } from '@server/__tests__/helpers';
import { tdb } from '@server/__tests__/setup';
import { pruneExpiredMessages } from '@server/crons/prune-expired';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

describe('dms router', () => {
  test('wipeConversation removes all messages for both participants', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller2 } = await initTest(2);

    const { channelId } = await caller1.dms.open({ userId: 2 });

    await caller1.messages.send({ channelId, content: 'one', files: [] });
    await caller2.messages.send({ channelId, content: 'two', files: [] });
    await caller1.messages.send({ channelId, content: 'three', files: [] });

    const before = await caller1.messages.get({
      channelId,
      cursor: null,
      limit: 50
    });
    expect(before.messages.length).toBe(3);

    // either participant can wipe
    await caller2.dms.wipeConversation({ channelId });

    const afterCaller1 = await caller1.messages.get({
      channelId,
      cursor: null,
      limit: 50
    });
    const afterCaller2 = await caller2.messages.get({
      channelId,
      cursor: null,
      limit: 50
    });

    expect(afterCaller1.messages.length).toBe(0);
    expect(afterCaller2.messages.length).toBe(0);

    // channel itself still exists (we only wiped messages)
    const followup = await caller1.messages.send({
      channelId,
      content: 'after wipe',
      files: []
    });
    expect(followup).toBeDefined();
  });

  test('wipeConversation rejects non-participants', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller3 } = await initTest(3);

    const { channelId } = await caller1.dms.open({ userId: 2 });

    await expect(
      caller3.dms.wipeConversation({ channelId })
    ).rejects.toThrow();
  });

  test('wipeConversation rejects on non-DM channels', async () => {
    const { caller } = await initTest(1);

    // channel id 1 is the default seeded TEXT channel, not a DM
    await expect(caller.dms.wipeConversation({ channelId: 1 })).rejects.toThrow(
      /DM/
    );
  });

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

  test('ephemeral mode: default off, toggle on/off round-trips', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller2 } = await initTest(2);

    const { channelId } = await caller1.dms.open({ userId: 2 });

    const initial = await caller1.dms.getEphemeral({ channelId });
    expect(initial.ephemeralMs).toBeNull();

    await caller1.dms.setEphemeral({ channelId, enabled: true });

    const afterSet = await caller2.dms.getEphemeral({ channelId });
    expect(afterSet.ephemeralMs).toBe(24 * 60 * 60 * 1000);

    await caller1.dms.setEphemeral({ channelId, enabled: false });
    const afterClear = await caller1.dms.getEphemeral({ channelId });
    expect(afterClear.ephemeralMs).toBeNull();
  });

  test('ephemeral mode: non-participant cannot read or set', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller3 } = await initTest(3);

    const { channelId } = await caller1.dms.open({ userId: 2 });

    await expect(caller3.dms.getEphemeral({ channelId })).rejects.toThrow(
      'You are not a participant in this DM channel'
    );

    await expect(
      caller3.dms.setEphemeral({ channelId, enabled: true })
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

    // turn on ephemeral, new message gets expiresAt ~now+24h
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    await caller1.dms.setEphemeral({ channelId, enabled: true });

    const before = Date.now();
    // server invariant: ephemeral channels require isEncrypted=true. The
    // content is just a marker string for the test (not real ciphertext)
    // this test only exercises expires_at + prune, not decryption.
    await caller1.messages.send({
      channelId,
      content: 'ephemeral',
      isEncrypted: true,
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
    expect(ephemeralRow!.expiresAt!).toBeGreaterThanOrEqual(
      before + TWENTY_FOUR_HOURS
    );
    expect(ephemeralRow!.expiresAt!).toBeLessThanOrEqual(
      after + TWENTY_FOUR_HOURS
    );

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
      caller.dms.setEphemeral({ channelId: 1, enabled: true })
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
