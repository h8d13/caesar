import { voiceProcedure } from '@server/utils/voice-procedure';

const createConsumerTransportRoute = voiceProcedure.mutation(({ ctx }) =>
  ctx.voiceRuntime.createConsumerTransport(ctx.user.id)
);

export { createConsumerTransportRoute };
