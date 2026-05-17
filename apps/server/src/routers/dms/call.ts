import { ServerEvents } from '@caesar/shared';
import {
  assertDmParticipant,
  getDirectMessageChannelParticipantIds
} from '@server/db/queries/dms';
import { VoiceRuntime } from '@server/runtimes/voice';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { z } from 'zod';

// In-memory registry: channelId -> { callerId, peerId }.
// Cleared on accept or hangup. Lives only for the duration of ringing.
export const pendingCalls = new Map<
  number,
  { callerId: number; peerId: number }
>();

const callRoute = protectedProcedure
  .input(z.object({ channelId: z.number() }))
  .mutation(async ({ input, ctx }) => {
    await assertDmParticipant(input.channelId, ctx.userId);

    invariant(!pendingCalls.has(input.channelId), {
      code: 'BAD_REQUEST',
      message: 'A call is already in progress for this DM'
    });

    const alreadyInCall = VoiceRuntime.findRuntimeByUserId(ctx.userId);
    invariant(!alreadyInCall, {
      code: 'BAD_REQUEST',
      message: 'Already in a call'
    });

    const participants = await getDirectMessageChannelParticipantIds(
      input.channelId
    );
    const peerId = participants.find((id) => id !== ctx.userId);

    invariant(peerId != null, {
      code: 'BAD_REQUEST',
      message: 'Peer not found'
    });

    // Lazy-init the VoiceRuntime for this DM channel if not already running.
    if (!VoiceRuntime.findById(input.channelId)) {
      const runtime = new VoiceRuntime(input.channelId);
      await runtime.init();
    }

    pendingCalls.set(input.channelId, { callerId: ctx.userId, peerId });

    ctx.pubsub.publishFor(peerId, ServerEvents.DM_CALL_RING, {
      channelId: input.channelId,
      callerId: ctx.userId
    });
  });

export { callRoute };
