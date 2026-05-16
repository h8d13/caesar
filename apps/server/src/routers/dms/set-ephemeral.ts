import { ServerEvents } from '@sharkord/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import {
  assertDmParticipant,
  getDirectMessageChannelParticipantIds,
  isDirectMessageChannel
} from '../../db/queries/dms';
import { directMessages } from '../../db/schema';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const ALLOWED_MS = new Set<number | null>([
  null,
  60 * 60 * 1000, // 1h
  24 * 60 * 60 * 1000, // 24h
  7 * 24 * 60 * 60 * 1000 // 7d
]);

const setEphemeralRoute = protectedProcedure
  .input(
    z.object({
      channelId: z.number(),
      ephemeralMs: z.number().int().positive().nullable()
    })
  )
  .mutation(async ({ ctx, input }) => {
    const isDm = await isDirectMessageChannel(input.channelId);

    invariant(isDm, {
      code: 'BAD_REQUEST',
      message: 'Ephemeral mode is only supported on DM channels'
    });

    invariant(ALLOWED_MS.has(input.ephemeralMs), {
      code: 'BAD_REQUEST',
      message: 'Invalid ephemeral duration'
    });

    await assertDmParticipant(input.channelId, ctx.userId);

    await db
      .update(directMessages)
      .set({ ephemeralMs: input.ephemeralMs })
      .where(eq(directMessages.channelId, input.channelId));

    const participants = await getDirectMessageChannelParticipantIds(
      input.channelId
    );

    ctx.pubsub.publishFor(participants, ServerEvents.DM_EPHEMERAL_UPDATE, {
      channelId: input.channelId,
      ephemeralMs: input.ephemeralMs
    });
  });

export { setEphemeralRoute };
