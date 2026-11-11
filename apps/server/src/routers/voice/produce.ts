import {
  ChannelPermission,
  getMediasoupKind,
  ServerEvents,
  StreamKind
} from '@caesar/shared';
import { invariant } from '@server/utils/invariant';
import { voiceProcedure } from '@server/utils/voice-procedure';
import { z } from 'zod';

const produceRoute = voiceProcedure
  .input(
    z.object({
      transportId: z.string(),
      kind: z.enum(StreamKind),
      rtpParameters: z.any(),
      qualityLayers: z
        .array(
          z.object({
            spatialLayer: z.number().int().nonnegative(),
            label: z.string().trim().min(1)
          })
        )
        .optional()
    })
  )
  .mutation(async ({ input, ctx }) => {
    if (input.kind === StreamKind.AUDIO) {
      await ctx.needsChannelPermission(
        ctx.voiceChannelId,
        ChannelPermission.SPEAK
      );
    } else if (input.kind === StreamKind.VIDEO) {
      await ctx.needsChannelPermission(
        ctx.voiceChannelId,
        ChannelPermission.WEBCAM
      );
    } else if (
      input.kind === StreamKind.SCREEN ||
      // the audio half of a screen share: without a check it was a way to
      // send audio with neither SPEAK nor SHARE_SCREEN
      input.kind === StreamKind.SCREEN_AUDIO
    ) {
      await ctx.needsChannelPermission(
        ctx.voiceChannelId,
        ChannelPermission.SHARE_SCREEN
      );
    }

    const producerTransport = ctx.voiceRuntime.getProducerTransport(
      ctx.user.id
    );

    invariant(producerTransport, {
      code: 'NOT_FOUND',
      message: 'Producer transport not found'
    });

    const producer = await producerTransport.produce({
      kind: getMediasoupKind(input.kind),
      rtpParameters: input.rtpParameters,
      appData: { kind: input.kind, userId: ctx.user.id }
    });

    ctx.voiceRuntime.addProducer(
      ctx.user.id,
      input.kind,
      producer,
      input.qualityLayers
    );

    ctx.pubsub.publishForChannel(
      ctx.voiceChannelId,
      ServerEvents.VOICE_NEW_PRODUCER,
      {
        channelId: ctx.voiceChannelId,
        remoteId: ctx.user.id,
        kind: input.kind
      }
    );

    return producer.id;
  });

export { produceRoute };
