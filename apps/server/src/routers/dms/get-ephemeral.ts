import {
  assertDmParticipant,
  getDmEphemeralMs,
  isDirectMessageChannel
} from '@server/db/queries/dms';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { z } from 'zod';

const getEphemeralRoute = protectedProcedure
  .input(z.object({ channelId: z.number() }))
  .query(async ({ ctx, input }) => {
    const isDm = await isDirectMessageChannel(input.channelId);

    invariant(isDm, {
      code: 'BAD_REQUEST',
      message: 'Not a DM channel'
    });

    await assertDmParticipant(input.channelId, ctx.userId);

    return { ephemeralMs: await getDmEphemeralMs(input.channelId) };
  });

export { getEphemeralRoute };
