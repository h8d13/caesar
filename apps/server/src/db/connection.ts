import {
  createClient,
  type Client,
  type Transaction,
  type TransactionMode
} from '@libsql/client';

// libsql's local client is a pool: each call borrows one of `concurrency`
// connections, opened lazily with SQLite defaults and no open hook. PRAGMAs
// are per connection, so open the whole pool up front: borrows made in the
// same tick each take a distinct connection, and released ones stay idle
// for reuse. Left lazy, any burst of parallel queries ran on connections
// with synchronous=FULL and busy_timeout=0.
//
// Kept small: cache_size applies per connection, and the pool only rejects
// work when every connection is held by an open transaction.
const POOL_SIZE = 8;

// FIFO lock: resolves with the release for the caller's turn. Releasing
// resolves one promise, so calling it again is a no-op.
const createLock = () => {
  let tail = Promise.resolve();

  return () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const turn = tail.then(() => release);

    tail = tail.then(() => held);

    return turn;
  };
};

// Transactions wait their turn in JS. A second BEGIN IMMEDIATE on another
// connection busy-waits inside SQLite, blocking the event loop the first
// transaction needs to commit: a freeze until busy_timeout, then
// SQLITE_BUSY. A db.transaction() nested in another's callback therefore
// waits forever: use the outer tx.
const serializeTransactions = (client: Client) => {
  const lock = createLock();
  const transaction = client.transaction.bind(client);

  client.transaction = async (mode?: TransactionMode) => {
    const release = await lock();
    let tx: Transaction;

    try {
      tx = await transaction(mode);
    } catch (error) {
      release();
      throw error;
    }

    // a failed COMMIT leaves it open: the turn ends with the rollback
    const endsTurn = (fn: () => Promise<void>) => async () => {
      try {
        await fn();
      } finally {
        if (tx.closed) release();
      }
    };
    const close = tx.close.bind(tx);

    tx.commit = endsTurn(tx.commit.bind(tx));
    tx.rollback = endsTurn(tx.rollback.bind(tx));
    tx.close = () => {
      close();
      release();
    };

    return tx;
  };
};

const createDbClient = async (url: string, pragmas: string[]) => {
  const client = createClient({ url, concurrency: POOL_SIZE });
  const init = pragmas.join('\n');

  await Promise.all(
    Array.from({ length: POOL_SIZE }, () => client.executeMultiple(init))
  );
  serializeTransactions(client);

  return client;
};

export { createDbClient };
