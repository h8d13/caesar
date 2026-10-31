import { messages, userRoles, users } from '@caesar/shared/db/schema';
import { initTest } from '@server/__tests__/helpers';
import { tdb } from '@server/__tests__/setup';
import { clearRateLimitersForTests } from '@server/utils/rate-limiters/rate-limiter';
import { eq } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { TestContext } from 'vite-plus/test';

// The test seed (4 users, 1 message) hides per-row costs. Benches grow it to
// a mid-size server so joinServer / history / search scan real volumes.
const BENCH_USERS = 200;
const BENCH_MESSAGES = 10_000;
const GENERAL_CHANNEL_ID = 1;
const INSERT_CHUNK = 500;

type TCaller = Awaited<ReturnType<typeof initTest>>['caller'];

const insertChunked = async <T>(
  rows: T[],
  insert: (c: T[]) => Promise<unknown>
) => {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await insert(rows.slice(i, i + INSERT_CHUNK));
  }
};

// Bulk users share the seeded member role (user 2) so permission checks run
// the same path as for a real member.
const growServer = async () => {
  const memberRole = await tdb
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, 2))
    .get();
  const now = Date.now();
  const newUsers = Array.from({ length: BENCH_USERS }, (_, i) => ({
    name: `Bench User ${i}`,
    identity: `bench${i}`,
    password: 'unused',
    createdAt: now
  }));
  const inserted: { id: number }[] = [];

  await insertChunked(newUsers, async (chunk) => {
    inserted.push(
      ...(await tdb.insert(users).values(chunk).returning({ id: users.id }))
    );
  });
  await insertChunked(
    inserted.map(({ id }) => ({
      userId: id,
      roleId: memberRole!.roleId,
      createdAt: now
    })),
    (chunk) => tdb.insert(userRoles).values(chunk)
  );

  const words = ['hello', 'deploy', 'voice', 'lag', 'meme', 'patch', 'ping'];
  const history = Array.from({ length: BENCH_MESSAGES }, (_, i) => ({
    userId: inserted[i % inserted.length]!.id,
    channelId: GENERAL_CHANNEL_ID,
    content: `<p>${words[i % words.length]} message ${i}</p>`,
    metadata: null,
    createdAt: now - (BENCH_MESSAGES - i) * 1000
  }));

  await insertChunked(history, (chunk) => tdb.insert(messages).values(chunk));

  return inserted.map(({ id }) => id);
};

// limiters are per client IP and window; a bench loop drives one user far
// past any human rate, so every iteration starts from an empty window
const resetLimits = () => clearRateLimitersForTests();

// Machine-specific, so local only (gitignored). `WRITE_BENCH=1 pnpm bench`
// stores the current numbers; later runs replay them next to the live run
// as a before/after table.
const BASELINE_DIR = path.resolve(import.meta.dirname, '../../benchmarks');
const WRITE_BASELINE = process.env.WRITE_BENCH === '1';

type TBench = TestContext['bench'];

// Registrations for one workload: the live run (limiter reset in the untimed
// beforeEach) and, when stored, its baseline replay.
const withBaseline = (
  bench: TBench,
  name: string,
  fn: () => Promise<unknown>
) => {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const file = path.join(BASELINE_DIR, `${slug}.json`);
  const live = bench(
    name,
    {
      beforeEach: resetLimits,
      ...(WRITE_BASELINE && { writeResult: file })
    },
    fn
  );

  if (WRITE_BASELINE || !existsSync(file)) return [live];

  return [bench.from(`${name} (baseline)`, file), live];
};

// one joined caller per simulated user, each from its own IP like real
// clients, so a burst of N users hits N limiter keys instead of one
const connectUsers = async (userIds: number[]): Promise<TCaller[]> => {
  const callers: TCaller[] = [];

  for (const [i, id] of userIds.entries()) {
    const ip = `10.0.${Math.floor(i / 256)}.${i % 256}`;

    callers.push((await initTest(id, ip)).caller);
  }

  return callers;
};

export {
  connectUsers,
  GENERAL_CHANNEL_ID,
  growServer,
  type TCaller,
  withBaseline
};
