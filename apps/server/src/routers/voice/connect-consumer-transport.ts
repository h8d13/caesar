import { invariant } from '@server/utils/invariant';
import { voiceProcedure } from '@server/utils/voice-procedure';
import { z } from 'zod';

const connectConsumerTransportRoute = voiceProcedure
  .input(
    z.object({
      dtlsParameters: z.any()
    })
  )
  .mutation(async ({ input, ctx }) => {
    const consumerTransport = ctx.voiceRuntime.getConsumerTransport(
      ctx.user.id
    );

    invariant(consumerTransport, {
      code: 'NOT_FOUND',
      message: 'Consumer transport not found'
    });

    await consumerTransport.connect({ dtlsParameters: input.dtlsParameters });
  });

export { connectConsumerTransportRoute };
