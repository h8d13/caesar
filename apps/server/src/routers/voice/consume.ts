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

    const router = ctx.voiceRuntime.getRouter();
    const routerCanConsume = router.canConsume({
      producerId: producer.id,
      rtpCapabilities: input.rtpCapabilities
    });

    invariant(routerCanConsume, {
      code: 'BAD_REQUEST',
      message: 'Cannot consume this producer with the given RTP capabilities'
    });

    const consumer = await userConsumerTransport.consume({
      producerId: producer.id,
      rtpCapabilities: input.rtpCapabilities,
      paused: false
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

    return {
      producerId: producer.id,
      consumerId: consumer.id,
      consumerKind: input.kind,
      consumerRtpParameters: consumer.rtpParameters,
      consumerType: consumer.type
    };
  });

export { consumeRoute };
