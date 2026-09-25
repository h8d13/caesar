import { OWNER_ROLE_ID, sha256 } from '@caesar/shared';
import { userRoles } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { publishUser } from '@server/db/publishers';
import { getSettings } from '@server/db/queries/server';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { z } from 'zod';

// The token grants Owner and is never rotated (it doubles as the HMAC key
// for IP / file hashing), so guessing must at least be throttled.
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
    const hashedToken = await sha256(input.token);

    invariant(hashedToken === settings.secretToken, {
      code: 'FORBIDDEN',
      message: 'Invalid secret token'
    });

    await db.insert(userRoles).values({
      userId: ctx.userId,
      roleId: OWNER_ROLE_ID,
      createdAt: Date.now()
    });

    void publishUser(ctx.userId, 'update');
  });

export { useSecretTokenRoute };
