import { StreamKind } from '@caesar/shared';
import { voiceProcedure } from '@server/utils/voice-procedure';
import { z } from 'zod';

const resumeConsumerRoute = voiceProcedure
  .input(
    z.object({
      remoteId: z.number(),
      kind: z.enum(StreamKind)
    })
  )
  .mutation(async ({ input, ctx }) => {
    const consumer = ctx.voiceRuntime.getConsumer(
      ctx.user.id,
      input.remoteId,
      input.kind
    );

    if (consumer && !consumer.closed && consumer.paused) {
      await consumer.resume();
    }
  });

export { resumeConsumerRoute };
