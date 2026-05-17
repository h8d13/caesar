import { Permission } from '@caesar/shared';
import { VoiceRuntime } from '@server/runtimes/voice';
import { invariant } from './invariant';
import { protectedProcedure, t } from './trpc';

const voiceRuntimeMiddleware = t.middleware(async ({ ctx, next }) => {
  await ctx.needsPermission(Permission.JOIN_VOICE_CHANNELS);

  invariant(ctx.currentVoiceChannelId, {
    code: 'BAD_REQUEST',
    message: 'User is not in a voice channel'
  });

  const voiceChannelId = ctx.currentVoiceChannelId;
  const voiceRuntime = VoiceRuntime.findById(voiceChannelId);

  invariant(voiceRuntime, {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Voice runtime not found for this channel'
  });

  return next({ ctx: { ...ctx, voiceChannelId, voiceRuntime } });
});

const voiceProcedure = protectedProcedure.use(voiceRuntimeMiddleware);

export { voiceProcedure };
