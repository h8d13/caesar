import {
  ChannelPermission,
  ChannelType,
  Permission,
  ServerEvents
} from '@caesar/shared';
import { config } from '@server/config';
import { getChannelByIdOrThrow } from '@server/db/queries/channels';
import { assertDmParticipant } from '@server/db/queries/dms';
import { logger } from '@server/logger';
import { VoiceRuntime } from '@server/runtimes/voice';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { z } from 'zod';

const joinVoiceRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.joinVoiceChannel.maxRequests,
  windowMs: config.rateLimiters.joinVoiceChannel.windowMs,
  logLabel: 'joinVoice'
})
  .input(
    z.object({
      channelId: z.number(),
      state: z.object({
        micMuted: z.boolean().default(false),
        soundMuted: z.boolean().default(false)
      })
    })
  )
  .mutation(async ({ input, ctx }) => {
    const channel = await getChannelByIdOrThrow(input.channelId);

    if (channel.isDm) {
      // DM calls: just verify participant, no server-wide voice permission needed.
      await assertDmParticipant(input.channelId, ctx.userId);
    } else {
      invariant(channel.type === ChannelType.VOICE, {
        code: 'BAD_REQUEST',
        message: 'Channel is not a voice channel'
      });
      await Promise.all([
        ctx.needsPermission(Permission.JOIN_VOICE_CHANNELS),
        ctx.needsChannelPermission(input.channelId, ChannelPermission.JOIN)
      ]);
    }

    const userAlreadyInVoiceChannel = VoiceRuntime.findRuntimeByUserId(
      ctx.user.id
    );

    invariant(!userAlreadyInVoiceChannel, {
      code: 'BAD_REQUEST',
      message: 'User already in a voice channel'
    });

    const runtime = VoiceRuntime.findById(input.channelId);

    invariant(runtime, {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Voice runtime not found for this channel'
    });

    runtime.addUser(ctx.user.id, input.state);

    const state = runtime.getUserState(ctx.user.id);
    const channelState = runtime.getState();

    ctx.currentVoiceChannelId = channel.id;
    ctx.pubsub.publish(ServerEvents.USER_JOIN_VOICE, {
      channelId: input.channelId,
      userId: ctx.user.id,
      state
    });
    ctx.pubsub.publish(ServerEvents.VOICE_CHANNEL_STATE_UPDATE, {
      channelId: input.channelId,
      activeSince: channelState.activeSince
    });

    logger.info('%s joined voice channel %s', ctx.user.name, channel.name);

    const router = runtime.getRouter();

    return {
      routerRtpCapabilities: router.rtpCapabilities
    };
  });

export { joinVoiceRoute };
