import { getChannelByIdOrThrow } from '@server/db/queries/channels';
import { logger } from '@server/logger';
import { removeFromVoice } from '@server/runtimes/voice-access';
import { invariant } from '@server/utils/invariant';
import { voiceProcedure } from '@server/utils/voice-procedure';

const leaveVoiceRoute = voiceProcedure.mutation(async ({ ctx }) => {
  const channel = await getChannelByIdOrThrow(ctx.voiceChannelId);

  const userInChannel = ctx.voiceRuntime.getUser(ctx.user.id);

  invariant(userInChannel, {
    code: 'BAD_REQUEST',
    message: 'User not in voice channel'
  });

  await removeFromVoice(ctx.voiceRuntime, ctx.user.id);

  ctx.currentVoiceChannelId = undefined;

  logger.info('%s left voice channel %s', ctx.user.name, channel.name);
});

export { leaveVoiceRoute };
