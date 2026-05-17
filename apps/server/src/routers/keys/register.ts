import { userKeys } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { protectedProcedure } from '@server/utils/trpc';
import { z } from 'zod';

// upsert the caller's E2EE public key. idempotent.
// 32-byte X25519 public key encoded as base64 (44 chars with padding).
const registerKeyRoute = protectedProcedure
  .input(z.object({ publicKey: z.string().min(1).max(64) }))
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
