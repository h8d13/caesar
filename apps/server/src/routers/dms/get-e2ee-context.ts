import { userKeys } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import {
  assertDmParticipant,
  getDirectMessageChannelParticipantIds,
  getDmEphemeralMs,
  isDirectMessageChannel
} from '@server/db/queries/dms';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

// One-shot per-DM lookup for the client: ephemerality, peer userId,
// peer public key (or null if peer hasn't registered yet).
// Client uses this both to gate encrypt-on-send and to fetch the key
// needed to decrypt-on-render.
const getE2eeContextRoute = protectedProcedure
  .input(z.object({ channelId: z.number() }))
  .query(async ({ ctx, input }) => {
    const isDm = await isDirectMessageChannel(input.channelId);

    invariant(isDm, {
      code: 'BAD_REQUEST',
      message: 'Not a DM channel'
    });

    await assertDmParticipant(input.channelId, ctx.userId);

    const participants = await getDirectMessageChannelParticipantIds(
      input.channelId
    );
    const peerUserId = participants.find((id) => id !== ctx.userId) ?? null;

    const ephemeralMs = await getDmEphemeralMs(input.channelId);

    let peerPublicKey: string | null = null;
    if (peerUserId !== null) {
      const row = await db
        .select({ publicKey: userKeys.publicKey })
        .from(userKeys)
        .where(eq(userKeys.userId, peerUserId))
        .get();
      peerPublicKey = row?.publicKey ?? null;
    }

    return { ephemeralMs, peerUserId, peerPublicKey };
  });

export { getE2eeContextRoute };
