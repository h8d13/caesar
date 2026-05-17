import { StreamKind } from '@caesar/shared';
import { voiceProcedure } from '@server/utils/voice-procedure';
import { z } from 'zod';

const requestKeyFrameRoute = voiceProcedure
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

    if (consumer && !consumer.closed) {
      await consumer.requestKeyFrame();
    }
  });

export { requestKeyFrameRoute };
