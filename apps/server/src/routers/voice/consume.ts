import { ServerEvents, StreamKind } from '@caesar/shared';
import { invariant } from '@server/utils/invariant';
import { voiceProcedure } from '@server/utils/voice-procedure';
import { z } from 'zod';

const consumeRoute = voiceProcedure
  .input(
    z.object({
      kind: z.enum(StreamKind),
      remoteId: z.number(),
      rtpCapabilities: z.any()
    })
  )
  .mutation(async ({ input, ctx }) => {
    const producer = ctx.voiceRuntime.getProducer(input.kind, input.remoteId);

    invariant(producer, {
      code: 'NOT_FOUND',
      message: 'Producer not found'
    });

    const userConsumerTransport = ctx.voiceRuntime.getConsumerTransport(
      ctx.user.id
    );

    invariant(userConsumerTransport, {
      code: 'NOT_FOUND',
      message: 'Consumer transport not found'
    });

    const consumerWorkerIndex = ctx.voiceRuntime.getWorkerIndexForUser(
      ctx.user.id
    );
    await ctx.voiceRuntime.ensureProducerOnRouter(
      producer,
      consumerWorkerIndex
    );

    const router = ctx.voiceRuntime.getRouterForUser(ctx.user.id);
    const routerCanConsume = router.canConsume({
      producerId: producer.id,
      rtpCapabilities: input.rtpCapabilities
    });

    invariant(routerCanConsume, {
      code: 'BAD_REQUEST',
      message: 'Cannot consume this producer with the given RTP capabilities'
    });

    // Create paused so the SFU doesn't forward RTP before the client has
    // wired its receive consumer onto the transport. Client calls
    // resumeConsumer (+ requestKeyFrame for SVC/simulcast) once ready;
    // otherwise mid-GOP packets arrive without a keyframe and the
    // decoder shows black until the producer's next scheduled keyframe.
    const consumer = await userConsumerTransport.consume({
      producerId: producer.id,
      rtpCapabilities: input.rtpCapabilities,
      paused: true
    });

    ctx.voiceRuntime.addConsumer(
      ctx.user.id,
      input.remoteId,
      input.kind,
      consumer
    );

    consumer.on('producerclose', () => {
      if (!ctx.currentVoiceChannelId) return;

      ctx.pubsub.publishForChannel(
        ctx.currentVoiceChannelId,
        ServerEvents.VOICE_PRODUCER_CLOSED,
        {
          channelId: ctx.currentVoiceChannelId,
          remoteId: input.remoteId,
          kind: input.kind
        }
      );
    });

    const qualityLayers =
      consumer.type === 'simulcast'
        ? ctx.voiceRuntime.getProducerQualityLayers(input.remoteId, input.kind)
        : [];

    return {
      producerId: producer.id,
      consumerId: consumer.id,
      consumerKind: input.kind,
      consumerRtpParameters: consumer.rtpParameters,
      consumerType: consumer.type,
      qualityLayers
    };
  });

export { consumeRoute };
