import { ServerEvents } from '@caesar/shared';
import { getChannelByIdOrThrow } from '@server/db/queries/channels';
import { getDirectMessageChannelParticipantIds } from '@server/db/queries/dms';
import { logger } from '@server/logger';
import { invariant } from '@server/utils/invariant';
import { voiceProcedure } from '@server/utils/voice-procedure';

const leaveVoiceRoute = voiceProcedure.mutation(async ({ ctx }) => {
  const channel = await getChannelByIdOrThrow(ctx.voiceChannelId);

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

  // For DM calls: notify the peer so their overlay closes, destroy runtime if empty.
  if (channel.isDm) {
    const participants = await getDirectMessageChannelParticipantIds(ctx.voiceChannelId);
    const peerId = participants.find((id) => id !== ctx.user.id);
    if (peerId != null) {
      ctx.pubsub.publishFor(peerId, ServerEvents.DM_CALL_ENDED, {
        channelId: ctx.voiceChannelId
      });
    }
    if (channelState.users.length === 0) {
      await ctx.voiceRuntime.destroy();
    }
  }

  ctx.currentVoiceChannelId = undefined;

  logger.info('%s left voice channel %s', ctx.user.name, channel.name);
});

export { leaveVoiceRoute };
