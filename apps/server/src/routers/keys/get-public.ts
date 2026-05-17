import { userKeys } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

// fetch a peer's public key, or null if they haven't logged in since
// E2EE shipped. Client uses null to refuse sending ephemeral DMs to peers
// that haven't registered a key yet.
const getPublicKeyRoute = protectedProcedure
  .input(z.object({ userId: z.number() }))
  .query(async ({ input }) => {
    const row = await db
      .select({ publicKey: userKeys.publicKey })
      .from(userKeys)
      .where(eq(userKeys.userId, input.userId))
      .get();

    return { publicKey: row?.publicKey ?? null };
  });

export { getPublicKeyRoute };
