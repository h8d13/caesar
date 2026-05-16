import { db } from '@server/db';
import { protectedProcedure } from '@server/utils/trpc';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

const PAGE_SIZE = 20;

const getGameHistoryRoute = protectedProcedure
  .input(
    z.object({
      page: z.number().int().min(0).default(0)
    })
  )
  .query(({ input }) => {
    const offset = input.page * PAGE_SIZE;

    // Union query across all 3 game types, all resolved bets (wins AND losses), sorted by time
    const rows = db.all<{
      userName: string;
      game: string;
      detail: string;
      profit: number;
      createdAt: number;
    }>(sql`
      SELECT * FROM (
        SELECT
          u.name AS userName,
          'Roulette' AS game,
          rb.bet_type AS detail,
          rb.profit AS profit,
          rb.created_at AS createdAt
        FROM roulette_bets rb
        JOIN users u ON u.id = rb.user_id
        WHERE rb.profit IS NOT NULL

        UNION ALL

        SELECT
          u.name AS userName,
          'Crash' AS game,
          CAST(cb.cashed_out_at AS TEXT) AS detail,
          cb.profit AS profit,
          cb.created_at AS createdAt
        FROM crash_bets cb
        JOIN users u ON u.id = cb.user_id
        WHERE cb.profit IS NOT NULL

        UNION ALL

        SELECT
          u.name AS userName,
          'Coinflip' AS game,
          (SELECT name FROM users WHERE id = CASE
            WHEN cg.winner_id = cg.creator_id THEN cg.opponent_id
            ELSE cg.creator_id
          END) AS detail,
          cg.amount AS profit,
          cg.resolved_at AS createdAt
        FROM coinflip_games cg
        JOIN users u ON u.id = cg.winner_id
        WHERE cg.status = 'resolved' AND cg.winner_id IS NOT NULL

        UNION ALL

        SELECT
          u.name AS userName,
          'Coinflip' AS game,
          (SELECT name FROM users WHERE id = cg.winner_id) AS detail,
          -cg.amount AS profit,
          cg.resolved_at AS createdAt
        FROM coinflip_games cg
        JOIN users u ON u.id = CASE
          WHEN cg.winner_id = cg.creator_id THEN cg.opponent_id
          ELSE cg.creator_id
        END
        WHERE cg.status = 'resolved' AND cg.winner_id IS NOT NULL
      )
      ORDER BY createdAt DESC
      LIMIT ${PAGE_SIZE + 1}
      OFFSET ${offset}
    `);

    const hasMore = rows.length > PAGE_SIZE;
    const items = rows.slice(0, PAGE_SIZE).map((row) => ({
      userName: row.userName,
      game: row.game as 'Roulette' | 'Crash' | 'Coinflip',
      detail:
        row.game === 'Crash' && row.detail
          ? `${parseFloat(row.detail).toFixed(2)}x`
          : row.game === 'Coinflip'
            ? `vs ${row.detail}`
            : row.detail.replace(/_/g, ' '),
      profit: row.profit,
      createdAt: row.createdAt
    }));

    return { items, hasMore, page: input.page };
  });

export { getGameHistoryRoute };
