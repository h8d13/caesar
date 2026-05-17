import { ChannelPermission, ServerEvents } from '@caesar/shared';
import { voiceProcedure } from '@server/utils/voice-procedure';
import { z } from 'zod';

const updateVoiceStateRoute = voiceProcedure
  .input(
    z.object({
      micMuted: z.boolean().optional(),
      soundMuted: z.boolean().optional(),
      webcamEnabled: z.boolean().optional(),
      sharingScreen: z.boolean().optional()
    })
  )
  .mutation(async ({ input, ctx }) => {
    const validatedInput = { ...input };

    const [canSpeak, canUseWebcam, canShareScreen] = await Promise.all([
      ctx.hasChannelPermission(ctx.voiceChannelId, ChannelPermission.SPEAK),
      ctx.hasChannelPermission(ctx.voiceChannelId, ChannelPermission.WEBCAM),
      ctx.hasChannelPermission(
        ctx.voiceChannelId,
        ChannelPermission.SHARE_SCREEN
      )
    ]);

    if (!canSpeak) {
      delete validatedInput.micMuted;
    }

    if (!canUseWebcam) {
      delete validatedInput.webcamEnabled;
    }

    if (!canShareScreen) {
      delete validatedInput.sharingScreen;
    }

    ctx.voiceRuntime.updateUserState(ctx.user.id, {
      ...validatedInput
    });

    const newState = ctx.voiceRuntime.getUserState(ctx.user.id);

    ctx.pubsub.publish(ServerEvents.USER_VOICE_STATE_UPDATE, {
      channelId: ctx.voiceChannelId,
      userId: ctx.user.id,
      state: newState
    });
  });

export { updateVoiceStateRoute };
