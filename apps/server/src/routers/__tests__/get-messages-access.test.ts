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

const countReadsOf = (statements: string[], table: string) =>
  statements.filter((sql) => new RegExp(`from "${table}"`, 'i').test(sql))
    .length;

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

// The route's fire-and-forget publishes issue their own queries; let them
// settle so they are not attributed to the call under measurement.
const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

describe('messages.get channel access', () => {
  test('reads the channel row once on a plain channel', async () => {
    const { caller } = await initTest(1);

    await caller.messages.send({ channelId: 1, content: 'hi', files: [] });
    await settle();

    const statements = await recordSql(() =>
      caller.messages.get({ channelId: 1, cursor: null, limit: 50 })
    );

    expect(countReadsOf(statements, 'channels')).toBe(1);
  });

  test('reads the channel row once on a DM channel', async () => {
    const { caller: caller1 } = await initTest(1);
    await initTest(2);

    const { channelId } = await caller1.dms.open({ userId: 2 });

    await caller1.messages.send({ channelId, content: 'hi', files: [] });
    await settle();

    const statements = await recordSql(() =>
      caller1.messages.get({ channelId, cursor: null, limit: 50 })
    );

    // The DM path also used to check participation twice (once via
    // assertDmParticipant, once via hasChannelPermission). One read remains
    // for the access check; the other is the read-state rollup.
    expect(countReadsOf(statements, 'channels')).toBe(1);
    expect(countReadsOf(statements, 'direct_messages')).toBe(2);
  });

  test('does not re-query the newest message on a first page', async () => {
    const { caller } = await initTest(1);

    await sendMessages(caller, 1, 3);
    await settle();

    const statements = await recordSql(() =>
      caller.messages.get({ channelId: 1, cursor: null, limit: 50 })
    );

    // One select of message rows for the page itself; the read-state update
    // reuses rows[0] instead of issuing its own ordered limit-1 lookup.
    const ordered = statements.filter((sql) =>
      /from "messages".*order by/is.test(sql)
    );

    expect(ordered).toHaveLength(1);
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

    // The fields the UI does render must survive the narrowing.
    for (const field of [
      'id',
      'content',
      'userId',
      'channelId',
      'parentMessageId',
      'editable',
      'metadata',
      'expiresAt',
      'createdAt',
      'pinned',
      'pinnedAt',
      'pinnedBy',
      'editedAt',
      'editedBy',
      'files',
      'reactions',
      'scVotes',
      'replyCount'
    ]) {
      expect(message).toHaveProperty(field);
    }
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
