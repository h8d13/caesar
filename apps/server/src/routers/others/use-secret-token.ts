import { OWNER_ROLE_ID } from '@caesar/shared';
import { userRoles } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { publishUser } from '@server/db/publishers';
import { getSettings } from '@server/db/queries/server';
import { sha256 } from '@server/helpers/sha256';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

// The token grants Owner, so guessing is throttled. It is a bootstrap key:
// it only works while the server has no owner (first start, or after the
// last owner deleted their account). Printed once in the first-boot log,
// it would otherwise make any member who ever sees that log an owner.
const useSecretTokenRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: 5,
  windowMs: 60_000,
  logLabel: 'useSecretToken'
})
  .input(
    z.object({
      token: z.string()
    })
  )
  .mutation(async ({ input, ctx }) => {
    const settings = await getSettings();

    invariant(sha256(input.token) === settings.secretToken, {
      code: 'FORBIDDEN',
      message: 'Invalid secret token'
    });

    // Insert only if no owner exists, in one statement: a check followed by
    // an insert would let two concurrent claims both become owner.
    const claimed = await db.run(sql`
      INSERT INTO ${userRoles} (user_id, role_id, created_at)
      SELECT ${ctx.userId}, ${OWNER_ROLE_ID}, ${Date.now()}
      WHERE NOT EXISTS (
        SELECT 1 FROM ${userRoles} WHERE ${userRoles.roleId} = ${OWNER_ROLE_ID}
      )`);

    invariant(claimed.rowsAffected > 0, {
      code: 'FORBIDDEN',
      message: 'This server already has an owner'
    });

    void publishUser(ctx.userId, 'update');
  });

export { useSecretTokenRoute };
