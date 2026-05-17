import { voiceProcedure } from '@server/utils/voice-procedure';

const getProducersRoute = voiceProcedure.query(({ ctx }) =>
  ctx.voiceRuntime.getRemoteIds(ctx.user.id)
);

export { getProducersRoute };
