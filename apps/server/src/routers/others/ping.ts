import { sql } from 'drizzle-orm';
import { db } from '@server/db';
import { protectedProcedure } from '@server/utils/trpc';

const pingRoute = protectedProcedure.query(() => {
  const dbStart = performance.now();
  db.run(sql`SELECT 1`);
  const dbPing = Math.round((performance.now() - dbStart) * 100) / 100;

  return {
    timestamp: Date.now(),
    dbPing
  };
});

export { pingRoute };
