import { Permission } from '@caesar/shared';
import { VoiceRuntime } from '@server/runtimes/voice';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { z } from 'zod';

const connectConsumerTransportRoute = protectedProcedure
  .input(
    z.object({
      dtlsParameters: z.any()
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

    const consumerTransport = runtime.getConsumerTransport(ctx.user.id);

    invariant(consumerTransport, {
      code: 'NOT_FOUND',
      message: 'Consumer transport not found'
    });

    await consumerTransport.connect({ dtlsParameters: input.dtlsParameters });
  });

export { connectConsumerTransportRoute };
