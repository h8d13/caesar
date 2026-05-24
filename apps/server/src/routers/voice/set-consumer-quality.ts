import { StreamKind } from '@caesar/shared';
import { invariant } from '@server/utils/invariant';
import { voiceProcedure } from '@server/utils/voice-procedure';
import { z } from 'zod';

const setConsumerQualityRoute = voiceProcedure
  .input(
    z.object({
      remoteId: z.number(),
      kind: z.enum([
        StreamKind.VIDEO,
        StreamKind.SCREEN,
        StreamKind.EXTERNAL_VIDEO
      ]),
      quality: z.discriminatedUnion('mode', [
        z.object({ mode: z.literal('auto') }),
        z.object({
          mode: z.literal('layer'),
          spatialLayer: z.number().int().nonnegative()
        })
      ])
    })
  )
  .mutation(async ({ input, ctx }) => {
    const consumer = ctx.voiceRuntime.getConsumer(
      ctx.user.id,
      input.remoteId,
      input.kind
    );

    invariant(consumer, {
      code: 'NOT_FOUND',
      message: 'Consumer not found'
    });

    // mediasoup spatial-layer switching only applies to simulcast consumers.
    // svc/simple consumers ignore preferred-layer hints; bail silently.
    if (consumer.type !== 'simulcast') return;

    const qualityLayers = ctx.voiceRuntime.getProducerQualityLayers(
      input.remoteId,
      input.kind
    );

    invariant(qualityLayers.length > 0, {
      code: 'BAD_REQUEST',
      message: 'Consumer quality layers are not available'
    });

    const topLayer = qualityLayers[qualityLayers.length - 1]!.spatialLayer;
    const spatialLayer =
      input.quality.mode === 'auto' ? topLayer : input.quality.spatialLayer;

    invariant(
      qualityLayers.some((l) => l.spatialLayer === spatialLayer),
      {
        code: 'BAD_REQUEST',
        message: 'Invalid consumer quality layer'
      }
    );

    await consumer.setPreferredLayers({ spatialLayer });
  });

export { setConsumerQualityRoute };
