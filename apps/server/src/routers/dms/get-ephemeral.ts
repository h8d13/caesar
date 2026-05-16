import { z } from 'zod';
import {
  assertDmParticipant,
  getDmEphemeralMs,
  isDirectMessageChannel
} from '../../db/queries/dms';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

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
