import { ChannelType, ServerEvents } from '@caesar/shared';
import { getChannelByIdOrThrow } from '@server/db/queries/channels';
import { logger } from '@server/logger';
import { invariant } from '@server/utils/invariant';
import { voiceProcedure } from '@server/utils/voice-procedure';

const leaveVoiceRoute = voiceProcedure.mutation(async ({ ctx }) => {
  const channel = await getChannelByIdOrThrow(ctx.voiceChannelId);

  invariant(channel.type === ChannelType.VOICE, {
    code: 'BAD_REQUEST',
    message: 'Channel is not a voice channel'
  });

  const userInChannel = ctx.voiceRuntime.getUser(ctx.user.id);

  invariant(userInChannel, {
    code: 'BAD_REQUEST',
    message: 'User not in voice channel'
  });

  ctx.voiceRuntime.removeUser(ctx.user.id);

  const channelState = ctx.voiceRuntime.getState();

  ctx.pubsub.publish(ServerEvents.USER_LEAVE_VOICE, {
    channelId: ctx.voiceChannelId,
    userId: ctx.user.id
  });
  ctx.pubsub.publish(ServerEvents.VOICE_CHANNEL_STATE_UPDATE, {
    channelId: ctx.voiceChannelId,
    activeSince: channelState.activeSince
  });
  ctx.currentVoiceChannelId = undefined;

  logger.info('%s left voice channel %s', ctx.user.name, channel.name);
});

export { leaveVoiceRoute };
