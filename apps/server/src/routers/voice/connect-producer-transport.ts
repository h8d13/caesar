import { invariant } from '@server/utils/invariant';
import { voiceProcedure } from '@server/utils/voice-procedure';
import { z } from 'zod';

const connectProducerTransportRoute = voiceProcedure
  .input(
    z.object({
      dtlsParameters: z.any()
    })
  )
  .mutation(async ({ input, ctx }) => {
    const producerTransport = ctx.voiceRuntime.getProducerTransport(
      ctx.user.id
    );

    invariant(producerTransport, {
      code: 'NOT_FOUND',
      message: 'Producer transport not found'
    });

    await producerTransport.connect({ dtlsParameters: input.dtlsParameters });
  });

export { connectProducerTransportRoute };
