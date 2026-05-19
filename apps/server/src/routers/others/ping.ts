import { db } from '@server/db';
import { protectedProcedure } from '@server/utils/trpc';
import { sql } from 'drizzle-orm';

const pingRoute = protectedProcedure.query(async () => {
  const dbStart = performance.now();
  await db.run(sql`SELECT 1`);
  const dbPing = Math.round((performance.now() - dbStart) * 100) / 100;

  return {
    timestamp: Date.now(),
    dbPing
  };
});

export { pingRoute };
