import { Permission, StreamKind } from '@caesar/shared';
import { VoiceRuntime } from '@server/runtimes/voice';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { z } from 'zod';

const requestKeyFrameRoute = protectedProcedure
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

    const consumer = runtime.getConsumer(
      ctx.user.id,
      input.remoteId,
      input.kind
    );

    if (consumer && !consumer.closed) {
      await consumer.requestKeyFrame();
    }
  });

export { requestKeyFrameRoute };
