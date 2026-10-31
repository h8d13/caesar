import { Permission } from '@caesar/shared';
import { VoiceRuntime } from '@server/runtimes/voice';
import { invariant } from './invariant';
import { protectedProcedure, t } from './trpc';

const voiceRuntimeMiddleware = t.middleware(async ({ ctx, next }) => {
  const voiceRuntime = ctx.currentVoiceChannelId
    ? VoiceRuntime.findById(ctx.currentVoiceChannelId)
    : undefined;

  // DM calls follow DM rules end to end: join only checks participation
  // (fixed for the DM's lifetime), JOIN_VOICE_CHANNELS gates server voice.
  if (!voiceRuntime?.isDm) {
    await ctx.needsPermission(Permission.JOIN_VOICE_CHANNELS);
  }

  invariant(ctx.currentVoiceChannelId, {
    code: 'BAD_REQUEST',
    message: 'User is not in a voice channel'
  });

  invariant(voiceRuntime, {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Voice runtime not found for this channel'
  });

  return next({
    ctx: { ...ctx, voiceChannelId: ctx.currentVoiceChannelId, voiceRuntime }
  });
});

const voiceProcedure = protectedProcedure.use(voiceRuntimeMiddleware);

export { voiceProcedure };
