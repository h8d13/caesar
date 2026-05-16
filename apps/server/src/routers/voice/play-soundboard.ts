import { ServerEvents } from '@caesar/shared';
import { VoiceRuntime } from '@server/runtimes/voice';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { z } from 'zod';

const playSoundboardRoute = protectedProcedure
  .input(
    z.object({
      soundId: z.number()
    })
  )
  .mutation(async ({ input, ctx }) => {
    invariant(ctx.currentVoiceChannelId, {
      code: 'BAD_REQUEST',
      message: 'User is not in a voice channel'
    });

    const runtime = VoiceRuntime.findById(ctx.currentVoiceChannelId);

    invariant(runtime, {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Voice runtime not found for this channel'
    });

    ctx.pubsub.publish(ServerEvents.SOUNDBOARD_PLAY, {
      channelId: ctx.currentVoiceChannelId,
      soundId: input.soundId
    });
  });

export { playSoundboardRoute };
