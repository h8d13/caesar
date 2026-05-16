import { OWNER_ROLE_ID, sha256 } from '@caesar/shared';
import { z } from 'zod';
import { db } from '@server/db';
import { publishUser } from '@server/db/publishers';
import { getSettings } from '@server/db/queries/server';
import { userRoles } from '@server/db/schema';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';

const useSecretTokenRoute = protectedProcedure
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

    publishUser(ctx.userId, 'update');
  });

export { useSecretTokenRoute };
