import { BASE64_32_BYTES_REGEX } from '@caesar/shared';
import { userKeys } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { protectedProcedure } from '@server/utils/trpc';
import { z } from 'zod';

// upsert the caller's E2EE public key (X25519, 32 bytes base64). Peers feed
// it to ECDH, so anything else is rejected here.
const registerKeyRoute = protectedProcedure
  .input(z.object({ publicKey: z.string().regex(BASE64_32_BYTES_REGEX) }))
  .mutation(async ({ ctx, input }) => {
    await db
      .insert(userKeys)
      .values({ userId: ctx.userId, publicKey: input.publicKey })
      .onConflictDoUpdate({
        target: userKeys.userId,
        set: { publicKey: input.publicKey }
      });
  });

export { registerKeyRoute };
