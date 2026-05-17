import { Permission, ServerEvents } from '@caesar/shared';
import { voiceProcedure } from '@server/utils/voice-procedure';
import { z } from 'zod';

const playSoundboardRoute = voiceProcedure
  .input(
    z.object({
      soundId: z.number()
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.USE_SOUNDBOARD);

    ctx.pubsub.publish(ServerEvents.SOUNDBOARD_PLAY, {
      channelId: ctx.voiceChannelId,
      soundId: input.soundId
    });
  });

export { playSoundboardRoute };
