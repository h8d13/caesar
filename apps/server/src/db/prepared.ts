// Builds a fixed-shape drizzle query once and reuses it: drizzle otherwise
// rebuilds the SQL (entity checks, column ordering, escaping) on every call,
// which profiled as ~20% of a joinServer burst. libsql still prepares the
// statement per run; only the build is cached.
//
// Lazy because `db` is unset until loadDb(). Tests swap the drizzle wrapper
// per file but keep one client per fork, so the first build stays valid.
// Callers must stay outside db.transaction(): a prepared query runs on the
// client, not the tx.
const prepared = <B extends { prepare: () => unknown }>(build: () => B) => {
  let query: ReturnType<B['prepare']> | undefined;

  return () => (query ??= build().prepare() as ReturnType<B['prepare']>);
};

export { prepared };
