import { type Client } from '@libsql/client';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test';
import { createDbClient } from '../connection';

const dbPath = path.join(os.tmpdir(), `caesar-conn-${process.pid}.sqlite`);
let client: Client;
// transactions held across non-database I/O, reported by the guard
let yielded: Error[] = [];

// Only this database's handles: the fork is shared with other test files
// (isolate: false), whose sockets and files open and close meanwhile. Exact
// paths, since the previous test's closed client can hold its deleted files
// ("<path> (deleted)") until GC finalizes the native connections.
const dbFiles = new Set(['', '-wal', '-shm'].map((suffix) => dbPath + suffix));
const openFds = () =>
  fs.readdirSync('/proc/self/fd').filter((fd) => {
    try {
      return dbFiles.has(fs.readlinkSync(`/proc/self/fd/${fd}`));
    } catch {
      return false;
    }
  }).length;

// More parallel reads than the pool has connections: every connection gets
// borrowed, waiters reuse released ones.
const busyTimeouts = async () => {
  const reads = Array.from({ length: 32 }, () =>
    client.execute('PRAGMA busy_timeout')
  );

  return new Set((await Promise.all(reads)).map((r) => r.rows[0]?.[0]));
};

// a macrotask: anything queued meanwhile runs while the transaction is open
const tick = () => new Promise((resolve) => setImmediate(resolve));

const insertInTransaction = async (value: number) => {
  const tx = await client.transaction('write');

  await tx.execute({ sql: 'INSERT INTO t VALUES (?)', args: [value] });
  await tick();
  await tx.commit();
};

beforeEach(async () => {
  yielded = [];
  client = await createDbClient(
    `file:${dbPath}`,
    ['PRAGMA journal_mode = WAL;', 'PRAGMA busy_timeout = 5000;'],
    (error) => yielded.push(error)
  );
  await client.execute('CREATE TABLE t (v INTEGER)');
});

afterEach(() => {
  client.close();

  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
});

describe('createDbClient', () => {
  test('every pooled connection carries the pragmas', async () => {
    expect(await busyTimeouts()).toEqual(new Set([5000]));
  });

  test('transactions keep the pool configured and open no handles', async () => {
    await insertInTransaction(0);
    const before = openFds();

    await Promise.all(
      Array.from({ length: 20 }, (_, i) => insertInTransaction(i))
    );

    expect(openFds()).toBe(before);
    expect(await busyTimeouts()).toEqual(new Set([5000]));
  });

  test('a batch waits for an open transaction instead of busy-waiting', async () => {
    const tx = await client.transaction('write');

    await tx.execute({ sql: 'INSERT INTO t VALUES (?)', args: [1] });

    const batch = client.batch([
      { sql: 'INSERT INTO t VALUES (?)', args: [2] },
      { sql: 'INSERT INTO t VALUES (?)', args: [3] }
    ]);
    const started = Date.now();

    await tick();
    await tx.commit();
    await batch;

    const { rows } = await client.execute('SELECT v FROM t ORDER BY rowid');

    expect(Date.now() - started).toBeLessThan(1000);
    expect(rows.map((row) => row.v)).toEqual([1, 2, 3]);
  });

  test('batches racing transactions and each other all commit', async () => {
    const batch = (value: number) =>
      client.batch([
        { sql: 'INSERT INTO t VALUES (?)', args: [value] },
        { sql: 'INSERT INTO t VALUES (?)', args: [value] }
      ]);
    const transactions = [1, 2, 3].map(insertInTransaction);

    // the first transaction is open now, the others queued behind it
    await tick();

    const started = Date.now();

    await Promise.all([...transactions, batch(4), batch(5), batch(6)]);

    const { rows } = await client.execute('SELECT count(*) AS n FROM t');

    expect(Date.now() - started).toBeLessThan(1000);
    expect(rows[0]?.n).toBe(9);
  });

  test('a rollback discards its writes', async () => {
    const tx = await client.transaction('write');

    await tx.execute({ sql: 'INSERT INTO t VALUES (?)', args: [1] });
    await tx.rollback();

    const { rows } = await client.execute('SELECT count(*) AS n FROM t');

    expect(rows[0]?.n).toBe(0);
  });
});

describe('yielded transactions', () => {
  const flagged = async (
    body: (tx: Awaited<ReturnType<Client['transaction']>>) => Promise<void>
  ) => {
    const tx = await client.transaction('write');

    await body(tx);
    await tx.commit();
    await tick();

    return yielded.length;
  };

  test('a transaction awaiting only queries is not flagged', async () => {
    const calls = await flagged(async (tx) => {
      for (let i = 0; i < 10; i++) {
        await tx.execute({ sql: 'INSERT INTO t VALUES (?)', args: [i] });
      }
    });

    expect(calls).toBe(0);
  });

  test('a transaction held across a macrotask is flagged once', async () => {
    const calls = await flagged(async (tx) => {
      await tx.execute({ sql: 'INSERT INTO t VALUES (1)', args: [] });
      await tick();
    });

    expect(calls).toBe(1);
  });
});
