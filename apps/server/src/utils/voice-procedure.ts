import { ChannelPermission, Permission } from '@caesar/shared';
import { VoiceRuntime } from '@server/runtimes/voice';
import { TRPCError } from '@trpc/server';
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

  // The socket's channel id is only a claim: a sweep (access revoked) or
  // another session's disconnect may have removed the user from the room
  // since. Without this they could keep creating transports and consuming
  // while absent from the member list.
  if (!voiceRuntime.getUser(ctx.user.id)) {
    ctx.currentVoiceChannelId = undefined;

    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'User is not in a voice channel'
    });
  }

  // join checked the channel; access can be taken away mid-call
  if (!voiceRuntime.isDm) {
    await ctx.needsChannelPermission(
      ctx.currentVoiceChannelId,
      ChannelPermission.JOIN
    );
  }

  return next({
    ctx: { ...ctx, voiceChannelId: ctx.currentVoiceChannelId, voiceRuntime }
  });
});

const voiceProcedure = protectedProcedure.use(voiceRuntimeMiddleware);

export { voiceProcedure };
