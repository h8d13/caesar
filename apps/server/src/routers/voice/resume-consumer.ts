import { Permission, StreamKind } from '@sharkord/shared';
import { z } from 'zod';
import { VoiceRuntime } from '../../runtimes/voice';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const resumeConsumerRoute = protectedProcedure
  .input(
    z.object({
      remoteId: z.number(),
      kind: z.enum(StreamKind)
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.JOIN_VOICE_CHANNELS);

    invariant(ctx.currentVoiceChannelId, {
      code: 'BAD_REQUEST',
      message: 'User is not in a voice channel'
    });

    const runtime = VoiceRuntime.findById(ctx.currentVoiceChannelId);

    invariant(runtime, {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Voice runtime not found for this channel'
    });

    const consumer = runtime.getConsumer(ctx.user.id, input.remoteId, input.kind);

    if (consumer && !consumer.closed && consumer.paused) {
      await consumer.resume();
    }
  });

export { resumeConsumerRoute };
