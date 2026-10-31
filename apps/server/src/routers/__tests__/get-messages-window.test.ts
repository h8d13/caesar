import { channelReadStates, messages } from '@caesar/shared/db/schema';
import { initTest, type TCaller } from '@server/__tests__/helpers';
import { tdb } from '@server/__tests__/setup';
import { setRateLimitingDisabled } from '@server/utils/rate-limiters';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test';

// Channel 2 starts empty in the seed. Rows go in directly, one second apart,
// so createdAt ties cannot blur page boundaries.
const CHANNEL_ID = 2;
const HISTORY = 120;
const LIMIT = 10;

// Oldest first.
const seedHistory = async (): Promise<number[]> => {
  const base = Date.now() - HISTORY * 1000;
  const rows = await tdb
    .insert(messages)
    .values(
      Array.from({ length: HISTORY }, (_, i) => ({
        userId: 1,
        channelId: CHANNEL_ID,
        content: `<p>m${i}</p>`,
        metadata: null,
        createdAt: base + i * 1000
      }))
    )
    .returning({ id: messages.id });

  return rows.map((r) => r.id);
};

// Responses are newest first; flip to compare against seedHistory.
const ascIds = (page: { messages: { id: number }[] }) =>
  page.messages.map((m) => m.id).reverse();

const followNewer = async (caller: TCaller, start: number | null) => {
  const ids: number[] = [];
  let newerCursor = start;

  // bounded: a cursor that never advances must fail, not hang
  for (let i = 0; newerCursor !== null && i < HISTORY; i++) {
    const page = await caller.messages.get({
      channelId: CHANNEL_ID,
      newerCursor,
      limit: LIMIT
    });

    expect(page.messages.length).toBeLessThanOrEqual(LIMIT);
    ids.push(...ascIds(page));
    newerCursor = page.newerCursor;
  }

  expect(newerCursor).toBeNull();

  return ids;
};

describe('messages.get windows', () => {
  beforeEach(() => setRateLimitingDisabled(true));
  afterEach(() => setRateLimitingDisabled(false));

  test('older pages chain without dropping a message', async () => {
    const { caller } = await initTest(1);
    const ids = await seedHistory();
    const seen: number[] = [];
    let cursor: number | null = null;

    do {
      const page = await caller.messages.get({
        channelId: CHANNEL_ID,
        cursor,
        limit: LIMIT
      });

      seen.unshift(...ascIds(page));
      cursor = page.nextCursor;
    } while (cursor !== null);

    expect(seen).toEqual(ids);
  });

  test('jump returns a bounded window around the target', async () => {
    const { caller } = await initTest(1);
    const ids = await seedHistory();
    const at = 60;
    const half = LIMIT / 2;

    const page = await caller.messages.get({
      channelId: CHANNEL_ID,
      targetMessageId: ids[at]!,
      limit: LIMIT
    });

    expect(ascIds(page)).toEqual(ids.slice(at - half, at + half + 1));
    expect(page.nextCursor).not.toBeNull();
    expect(page.newerCursor).not.toBeNull();
  });

  test('newer pages from a jump reach the tail without gaps', async () => {
    const { caller } = await initTest(1);
    const ids = await seedHistory();

    const jump = await caller.messages.get({
      channelId: CHANNEL_ID,
      targetMessageId: ids[30]!,
      limit: LIMIT
    });
    const newer = await followNewer(caller, jump.newerCursor);

    const window = ascIds(jump);

    expect([...window, ...newer]).toEqual(ids.slice(ids.indexOf(window[0]!)));
  });

  test('older pages from a jump continue below the window', async () => {
    const { caller } = await initTest(1);
    const ids = await seedHistory();

    const jump = await caller.messages.get({
      channelId: CHANNEL_ID,
      targetMessageId: ids[30]!,
      limit: LIMIT
    });
    const older = await caller.messages.get({
      channelId: CHANNEL_ID,
      cursor: jump.nextCursor,
      limit: LIMIT
    });

    const window = ascIds(jump);
    const start = ids.indexOf(window[0]!);

    expect(ascIds(older)).toEqual(ids.slice(start - LIMIT, start));
  });

  test('jump near the tail is attached (no newer cursor)', async () => {
    const { caller } = await initTest(1);
    const ids = await seedHistory();

    const page = await caller.messages.get({
      channelId: CHANNEL_ID,
      targetMessageId: ids[HISTORY - 2]!,
      limit: LIMIT
    });

    expect(page.newerCursor).toBeNull();
    expect(ascIds(page).at(-1)).toBe(ids.at(-1));
  });

  test('a detached jump still marks the newest message read', async () => {
    const { caller } = await initTest(1);
    const ids = await seedHistory();

    await caller.messages.get({
      channelId: CHANNEL_ID,
      targetMessageId: ids[10]!,
      limit: LIMIT
    });

    const state = await tdb
      .select()
      .from(channelReadStates)
      .where(
        and(
          eq(channelReadStates.userId, 1),
          eq(channelReadStates.channelId, CHANNEL_ID)
        )
      )
      .get();

    expect(state?.lastReadMessageId).toBe(ids.at(-1));
  });
});
