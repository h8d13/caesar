import { ChannelPermission, Permission } from '@caesar/shared';
import { config } from '@server/config';
import { logger } from '@server/logger';
import { VoiceRuntime } from '@server/runtimes/voice';
import { TRPCError } from '@trpc/server';
import { invariant } from './invariant';
import { createTokenBucketRateLimiter } from './rate-limiters/rate-limiter';
import { protectedProcedure, t } from './trpc';

// One bucket per user for everything a call does after join. The object
// counts are bounded by the runtime, the churn is not: any of these can be
// called in a loop, by guests too.
const voiceSignalingLimiter = createTokenBucketRateLimiter({
  maxRequests: config.rateLimiters.voiceSignaling.maxRequests,
  windowMs: config.rateLimiters.voiceSignaling.windowMs
});

// Tokens per call; anything not listed costs 1.
const VOICE_CALL_COST: Record<string, number> = {
  // always allowed: a user out of tokens must still be able to hang up,
  // and once out of the room every other route here rejects them
  'voice.leave': 0,
  // a WebRTC transport is the heaviest thing a call allocates
  'voice.createProducerTransport': 10,
  'voice.createConsumerTransport': 10,
  // amplifies: VOICE_NEW_PRODUCER makes every other participant answer
  // with consume + resume (+ a keyframe request), paid from their own
  // bucket. Priced so one user's sustained rate (1/s at the defaults) stays
  // far below what the others earn back.
  'voice.produce': 20
};

const voiceRuntimeMiddleware = t.middleware(async ({ ctx, next, path }) => {
  // before any lookup, so a loop of calls that would be rejected below
  // (not in a room, no permission) is bounded too
  const cost = VOICE_CALL_COST[path] ?? 1;

  if (
    cost > 0 &&
    !voiceSignalingLimiter.consume(`${ctx.user.id}`, cost).allowed
  ) {
    logger.debug(`[RateLimit] ${path} blocked user=${ctx.user.id}`);

    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests. Please try again shortly.'
    });
  }

  const voiceRuntime = ctx.currentVoiceChannelId
    ? VoiceRuntime.findById(ctx.currentVoiceChannelId)
    : undefined;

  // DM calls follow DM rules end to end: join only checks participation
  // (fixed for the DM's lifetime), JOIN_VOICE_CHANNELS gates server voice.
  // Temp rooms hold guests, who have no roles at all: holding the link was
  // checked at join, and being in the room is checked below.
  if (!voiceRuntime?.isDm && !voiceRuntime?.isTemp) {
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
    ctx: {
      ...ctx,
      voiceChannelId: ctx.currentVoiceChannelId,
      voiceRuntime,
      // The procedure gets a copy of ctx: writing currentVoiceChannelId
      // there never reaches the socket's own context, which the voice
      // event subscriptions read.
      clearVoiceChannel: () => {
        ctx.currentVoiceChannelId = undefined;
      }
    }
  });
});

const voiceProcedure = protectedProcedure.use(voiceRuntimeMiddleware);

export { voiceProcedure };
