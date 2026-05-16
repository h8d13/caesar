import { ServerEvents } from '@caesar/shared';
import { directMessages } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import {
  assertDmParticipant,
  getDirectMessageChannelParticipantIds,
  isDirectMessageChannel
} from '@server/db/queries/dms';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const EPHEMERAL_MS = 24 * 60 * 60 * 1000;

const setEphemeralRoute = protectedProcedure
  .input(
    z.object({
      channelId: z.number(),
      enabled: z.boolean()
    })
  )
  .mutation(async ({ ctx, input }) => {
    const isDm = await isDirectMessageChannel(input.channelId);

    invariant(isDm, {
      code: 'BAD_REQUEST',
      message: 'Ephemeral mode is only supported on DM channels'
    });

    await assertDmParticipant(input.channelId, ctx.userId);

    const ephemeralMs = input.enabled ? EPHEMERAL_MS : null;

    await db
      .update(directMessages)
      .set({ ephemeralMs })
      .where(eq(directMessages.channelId, input.channelId));

    const participants = await getDirectMessageChannelParticipantIds(
      input.channelId
    );

    ctx.pubsub.publishFor(participants, ServerEvents.DM_EPHEMERAL_UPDATE, {
      channelId: input.channelId,
      ephemeralMs
    });
  });

export { setEphemeralRoute };
