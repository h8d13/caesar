import { ChannelPermission, ServerEvents } from '@caesar/shared';
import { notifyTempRoomChanged } from '@server/runtimes/temp-rooms';
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

    const permissions = await ctx.getChannelPermissions(ctx.voiceChannelId);

    if (!permissions[ChannelPermission.SPEAK]) {
      delete validatedInput.micMuted;
    }

    if (!permissions[ChannelPermission.WEBCAM]) {
      delete validatedInput.webcamEnabled;
    }

    if (!permissions[ChannelPermission.SHARE_SCREEN]) {
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

    // temp rooms: presence above only reaches who is in the room, the
    // lists of rooms (creator, managers) are told apart
    if (ctx.voiceRuntime.isTemp) notifyTempRoomChanged(ctx.voiceChannelId);
  });

export { updateVoiceStateRoute };
