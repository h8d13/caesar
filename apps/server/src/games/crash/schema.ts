import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const crashRounds = sqliteTable(
  'crash_rounds',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    crashPoint: real('crash_point').notNull(),
    hash: text('hash').notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
  },
  (t) => [
    index('crash_rounds_started_idx').on(t.startedAt),
    index('crash_rounds_ended_idx').on(t.endedAt),
  ]
);

const crashBets = sqliteTable(
  'crash_bets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    roundId: integer('round_id')
      .notNull()
      .references(() => crashRounds.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull(),
    amount: integer('amount').notNull(),
    cashedOutAt: real('cashed_out_at'),
    profit: integer('profit'),
    ledgerEntryId: integer('ledger_entry_id'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('crash_bets_round_idx').on(t.roundId),
    index('crash_bets_user_idx').on(t.userId),
    index('crash_bets_round_user_idx').on(t.roundId, t.userId),
  ]
);

export { crashBets, crashRounds };
