import { voiceProcedure } from '@server/utils/voice-procedure';

const createProducerTransportRoute = voiceProcedure.mutation(({ ctx }) =>
  ctx.voiceRuntime.createProducerTransport(ctx.user.id)
);

export { createProducerTransportRoute };
