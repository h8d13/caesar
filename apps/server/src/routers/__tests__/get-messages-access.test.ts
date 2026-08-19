import { channelReadStates } from '@caesar/shared/db/schema';
import type { Client } from '@libsql/client';
import { initTest } from '@server/__tests__/helpers';
import { tdb } from '@server/__tests__/setup';
import { and, eq } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';

// messages.get used to read the same channels row three times per call (the
// DM check, the permission check, and the handler's own fileAccessToken
// lookup) and re-query the channel's newest message even when the first page
// already contained it. These tests pin both down.

type Caller = Awaited<ReturnType<typeof initTest>>['caller'];

// Records the SQL issued while fn runs. libsql is the only path to the DB, so
// wrapping execute catches every statement drizzle emits.
const recordSql = async (fn: () => Promise<unknown>): Promise<string[]> => {
  const g = globalThis as typeof globalThis & { __caesarSqlite?: Client };
  const sqlite = g.__caesarSqlite;

  if (!sqlite) throw new Error('test sqlite client missing');

  const original = sqlite.execute.bind(sqlite);
  const statements: string[] = [];

  (sqlite as unknown as { execute: unknown }).execute = ((
    ...args: Parameters<Client['execute']>
  ) => {
    const stmt = args[0];

    statements.push(
      typeof stmt === 'string' ? stmt : ((stmt as { sql: string }).sql ?? '')
    );

    return original(...args);
  }) as Client['execute'];

  try {
    await fn();
  } finally {
    (sqlite as unknown as { execute: unknown }).execute = original;
  }

  return statements;
};

// Match the exact projections under test rather than "any read of table X":
// the route fires publishes whose own queries land in the same window, and a
// table-level count would fold those in and break on unrelated changes.
const ACCESS_CHANNEL_READ =
  /select "private", "is_dm_channel", "file_access_token" from "channels"/i;

// The ordered limit-1 lookup the read-state update used to issue on every
// page, including pages that already contained the newest message.
const LATEST_MESSAGE_LOOKUP = /select "id" from "messages".*order by/is;

const countMatching = (statements: string[], pattern: RegExp) =>
  statements.filter((sql) => pattern.test(sql)).length;

const getReadState = async (userId: number, channelId: number) =>
  tdb
    .select()
    .from(channelReadStates)
    .where(
      and(
        eq(channelReadStates.userId, userId),
        eq(channelReadStates.channelId, channelId)
      )
    )
    .get();

const sendMessages = async (caller: Caller, channelId: number, n: number) => {
  const ids: number[] = [];

  for (let i = 0; i < n; i++) {
    await caller.messages.send({
      channelId,
      content: `message ${i}`,
      files: []
    });
  }

  // Newest first, matching the order the route returns.
  const page = await caller.messages.get({
    channelId,
    cursor: null,
    limit: 100
  });

  for (const message of page.messages) ids.push(message.id);

  return ids;
};

describe('messages.get channel access', () => {
  test('reads the channel row once on a plain channel', async () => {
    const { caller } = await initTest(1);

    await caller.messages.send({ channelId: 1, content: 'hi', files: [] });

    const statements = await recordSql(() =>
      caller.messages.get({ channelId: 1, cursor: null, limit: 50 })
    );

    expect(countMatching(statements, ACCESS_CHANNEL_READ)).toBe(1);
  });

  test('reads the channel row once on a DM channel', async () => {
    const { caller: caller1 } = await initTest(1);
    await initTest(2);

    const { channelId } = await caller1.dms.open({ userId: 2 });

    await caller1.messages.send({ channelId, content: 'hi', files: [] });

    const statements = await recordSql(() =>
      caller1.messages.get({ channelId, cursor: null, limit: 50 })
    );

    // The DM path also used to check participation twice (once via
    // assertDmParticipant, once via hasChannelPermission).
    expect(countMatching(statements, ACCESS_CHANNEL_READ)).toBe(1);
  });

  test('does not re-query the newest message on a first page', async () => {
    const { caller } = await initTest(1);

    await sendMessages(caller, 1, 3);

    const statements = await recordSql(() =>
      caller.messages.get({ channelId: 1, cursor: null, limit: 50 })
    );

    // rows[0] is already the newest message on a first page.
    expect(countMatching(statements, LATEST_MESSAGE_LOOKUP)).toBe(0);
  });

  test('does re-query the newest message on a cursor page', async () => {
    const { caller } = await initTest(1);

    await sendMessages(caller, 1, 5);

    const firstPage = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 2
    });

    const statements = await recordSql(() =>
      caller.messages.get({
        channelId: 1,
        cursor: firstPage.nextCursor,
        limit: 2
      })
    );

    // Paging back, rows[0] is not the channel's newest, so the lookup is
    // required -- this is the query the first-page test asserts is absent.
    expect(countMatching(statements, LATEST_MESSAGE_LOOKUP)).toBe(1);
  });

  test('reads the channel row once on pinned and thread reads', async () => {
    const { caller } = await initTest(1);

    await caller.messages.send({ channelId: 1, content: 'parent', files: [] });

    const page = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });
    const parentId = page.messages[0]!.id;

    await caller.messages.togglePin({ messageId: parentId });
    await caller.messages.send({
      channelId: 1,
      content: 'reply',
      files: [],
      parentMessageId: parentId
    });

    // Both routes call assertChannelAccess and then need the same row for
    // fileAccessToken; they must use the returned one, not select it again.
    const pinnedSql = await recordSql(() =>
      caller.messages.getPinned({ channelId: 1 })
    );

    expect(countMatching(pinnedSql, ACCESS_CHANNEL_READ)).toBe(1);

    const threadSql = await recordSql(() =>
      caller.messages.getThread({
        parentMessageId: parentId,
        cursor: null,
        limit: 50
      })
    );

    expect(countMatching(threadSql, ACCESS_CHANNEL_READ)).toBe(1);
  });

  test('still enforces DM participation', async () => {
    const { caller: caller1 } = await initTest(1);
    await initTest(2);
    const { caller: caller3 } = await initTest(3);

    const { channelId } = await caller1.dms.open({ userId: 2 });

    await expect(
      caller3.messages.get({ channelId, cursor: null, limit: 50 })
    ).rejects.toThrow();
  });

  test('allows both DM participants', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller2 } = await initTest(2);

    const { channelId } = await caller1.dms.open({ userId: 2 });

    await caller1.messages.send({ channelId, content: 'hello', files: [] });

    const asSender = await caller1.messages.get({
      channelId,
      cursor: null,
      limit: 50
    });
    const asRecipient = await caller2.messages.get({
      channelId,
      cursor: null,
      limit: 50
    });

    expect(asSender.messages).toHaveLength(1);
    expect(asRecipient.messages).toHaveLength(1);
  });
});

describe('messages.get payload shape', () => {
  // Every column of the messages table used to ship on every row. These two
  // are the ones nothing on the client reads.
  const NEVER_READ = ['updatedAt', 'replyToMessageId'];

  test('omits fields the client never reads', async () => {
    const { caller } = await initTest(1);

    await caller.messages.send({ channelId: 1, content: 'hello', files: [] });

    const page = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const message = page.messages[0]!;

    for (const field of NEVER_READ) {
      expect(message).not.toHaveProperty(field);
    }

    // Spot-check that narrowing the select did not also drop a rendered
    // column; the full field list is enforced by TJoinedMessage.
    expect(message.content).toBe('hello');
    expect(message.editedAt).toBeNull();
    expect(message.files).toEqual([]);
  });

  test('resolves replyTo instead of shipping the raw id', async () => {
    const { caller } = await initTest(1);

    await caller.messages.send({ channelId: 1, content: 'parent', files: [] });

    const first = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });
    const parentId = first.messages[0]!.id;

    await caller.messages.send({
      channelId: 1,
      content: 'child',
      files: [],
      replyToMessageId: parentId
    });

    const page = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });
    const child = page.messages.find((m) => m.content === 'child')!;

    expect(child).not.toHaveProperty('replyToMessageId');
    expect(child.replyTo?.id).toBe(parentId);
    expect(child.replyTo?.content).toBe('parent');
  });

  test('omits the same fields on pinned and thread reads', async () => {
    const { caller } = await initTest(1);

    await caller.messages.send({ channelId: 1, content: 'parent', files: [] });

    const page = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });
    const parentId = page.messages[0]!.id;

    await caller.messages.togglePin({ messageId: parentId });
    await caller.messages.send({
      channelId: 1,
      content: 'reply',
      files: [],
      parentMessageId: parentId
    });

    const pinned = await caller.messages.getPinned({ channelId: 1 });
    const thread = await caller.messages.getThread({
      parentMessageId: parentId,
      cursor: null,
      limit: 50
    });

    for (const field of NEVER_READ) {
      expect(pinned[0]!).not.toHaveProperty(field);
      expect(thread.messages[0]!).not.toHaveProperty(field);
    }
  });
});

describe('messages.get read state', () => {
  test('marks the newest message read on a first page', async () => {
    const { caller } = await initTest(1);

    const ids = await sendMessages(caller, 1, 3);
    const newestId = ids[0]!;

    await caller.messages.get({ channelId: 1, cursor: null, limit: 50 });

    const state = await getReadState(1, 1);

    expect(state?.lastReadMessageId).toBe(newestId);
  });

  test('keeps the newest message read when paging back', async () => {
    const { caller } = await initTest(1);

    const ids = await sendMessages(caller, 1, 5);
    const newestId = ids[0]!;

    // Page 1 (newest two), then follow the cursor into older history.
    const firstPage = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 2
    });

    expect(firstPage.nextCursor).toBeTruthy();

    await caller.messages.get({
      channelId: 1,
      cursor: firstPage.nextCursor,
      limit: 2
    });

    const state = await getReadState(1, 1);

    // Scrolling back must not roll read state onto an older message.
    expect(state?.lastReadMessageId).toBe(newestId);
  });

  test('marks the newest message read when jumping to a target', async () => {
    const { caller } = await initTest(1);

    const ids = await sendMessages(caller, 1, 5);
    const newestId = ids[0]!;
    const oldestId = ids[ids.length - 1]!;

    await caller.messages.get({
      channelId: 1,
      cursor: null,
      targetMessageId: oldestId,
      limit: 50
    });

    const state = await getReadState(1, 1);

    expect(state?.lastReadMessageId).toBe(newestId);
  });
});
