import { type Client } from '@libsql/client';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test';
import { createDbClient } from '../connection';

const dbPath = path.join(os.tmpdir(), `caesar-conn-${process.pid}.sqlite`);
let client: Client;

const openFds = () => fs.readdirSync('/proc/self/fd').length;

// More parallel reads than the pool has connections: every connection gets
// borrowed, waiters reuse released ones.
const busyTimeouts = async () => {
  const reads = Array.from({ length: 32 }, () =>
    client.execute('PRAGMA busy_timeout')
  );

  return new Set((await Promise.all(reads)).map((r) => r.rows[0]?.[0]));
};

const insertInTransaction = async (value: number) => {
  const tx = await client.transaction('write');

  await tx.execute({ sql: 'INSERT INTO t VALUES (?)', args: [value] });
  await tx.commit();
};

beforeEach(async () => {
  client = await createDbClient(`file:${dbPath}`, [
    'PRAGMA journal_mode = WAL;',
    'PRAGMA busy_timeout = 5000;'
  ]);
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

  test('a rollback discards its writes', async () => {
    const tx = await client.transaction('write');

    await tx.execute({ sql: 'INSERT INTO t VALUES (?)', args: [1] });
    await tx.rollback();

    const { rows } = await client.execute('SELECT count(*) AS n FROM t');

    expect(rows[0]?.n).toBe(0);
  });
});
