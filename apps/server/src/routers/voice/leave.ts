import { getChannelByIdOrThrow } from '@server/db/queries/channels';
import { logger } from '@server/logger';
import { removeFromVoice } from '@server/runtimes/voice-access';
import { invariant } from '@server/utils/invariant';
import { voiceProcedure } from '@server/utils/voice-procedure';

const leaveVoiceRoute = voiceProcedure.mutation(async ({ ctx }) => {
  // a temp room has no channel row to name it
  const channelName = ctx.voiceRuntime.isTemp
    ? `temp room ${ctx.voiceChannelId}`
    : (await getChannelByIdOrThrow(ctx.voiceChannelId)).name;

  const userInChannel = ctx.voiceRuntime.getUser(ctx.user.id);

  invariant(userInChannel, {
    code: 'BAD_REQUEST',
    message: 'User not in voice channel'
  });

  await removeFromVoice(ctx.voiceRuntime, ctx.user.id);

  ctx.clearVoiceChannel();

  logger.info('%s left voice channel %s', ctx.user.name, channelName);
});

export { leaveVoiceRoute };
