import { ServerEvents } from '@caesar/shared';
import {
  assertDmParticipant,
  getDirectMessageChannelParticipantIds
} from '@server/db/queries/dms';
import { VoiceRuntime } from '@server/runtimes/voice';
import { protectedProcedure } from '@server/utils/trpc';
import { z } from 'zod';
import { pendingCalls } from './call';

const hangupCallRoute = protectedProcedure
  .input(z.object({ channelId: z.number() }))
  .mutation(async ({ input, ctx }) => {
    await assertDmParticipant(input.channelId, ctx.userId);

    // Clear pending ring if still in that state.
    pendingCalls.delete(input.channelId);

    const participants = await getDirectMessageChannelParticipantIds(input.channelId);
    const otherId = participants.find((id) => id !== ctx.userId);

    if (otherId != null) {
      ctx.pubsub.publishFor(otherId, ServerEvents.DM_CALL_ENDED, {
        channelId: input.channelId
      });
    }

    // Destroy the runtime if both parties have left (or call was never joined).
    const runtime = VoiceRuntime.findById(input.channelId);
    if (runtime && runtime.getState().users.length === 0) {
      await runtime.destroy();
    }
  });

export { hangupCallRoute };
