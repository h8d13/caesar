import {
  ChannelPermission,
  STREAM_PREVIEW_MAX_LENGTH,
  STREAM_PREVIEW_MIN_INTERVAL_MS,
  StreamKind
} from '@caesar/shared';
import { VoiceRuntime } from '@server/runtimes/voice';
import { protectedProcedure } from '@server/utils/trpc';
import { voiceProcedure } from '@server/utils/voice-procedure';
import { z } from 'zod';

const zPreviewKind = z.union([
  z.literal(StreamKind.VIDEO),
  z.literal(StreamKind.SCREEN)
]);

const JPEG_PREFIX = 'data:image/jpeg;base64,';

// A base64 JPEG data URL, checked down to its magic bytes: it is rendered
// as-is in other users' <img>, so nothing but a JPEG may be stored.
const zPreviewImage = z
  .string()
  .max(STREAM_PREVIEW_MAX_LENGTH)
  .refine((value) => {
    if (!value.startsWith(JPEG_PREFIX)) return false;

    const base64 = value.slice(JPEG_PREFIX.length);

    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return false;

    const head = Buffer.from(base64.slice(0, 8), 'base64');

    return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  }, 'Invalid preview image');

// The streamer's client uploads a still of its own camera / screen share
// every few seconds. Stored only while that producer runs, which already
// required WEBCAM / SHARE_SCREEN (and loses it on revocation).
const setStreamPreviewRoute = voiceProcedure
  .input(z.object({ kind: zPreviewKind, image: zPreviewImage }))
  .mutation(({ ctx, input }) => {
    const now = Date.now();
    const current = ctx.voiceRuntime.getStreamPreview(ctx.user.id, input.kind);

    // a client sending faster than the cadence is not refused, just ignored
    if (current && now - current.updatedAt < STREAM_PREVIEW_MIN_INTERVAL_MS) {
      return { stored: false };
    }

    // false while the producer is not there (yet): the client retries sooner
    const stored = ctx.voiceRuntime.setStreamPreview(ctx.user.id, input.kind, {
      image: input.image,
      updatedAt: now
    });

    return { stored };
  });

// Same visibility as voice presence: whoever can see the channel (and so
// sees who streams in it) may see the preview, without joining.
const getStreamPreviewRoute = protectedProcedure
  .input(
    z.object({
      channelId: z.number(),
      userId: z.number(),
      kind: zPreviewKind
    })
  )
  .query(async ({ ctx, input }) => {
    await ctx.needsChannelPermission(
      input.channelId,
      ChannelPermission.VIEW_CHANNEL
    );

    const preview = VoiceRuntime.findById(input.channelId)?.getStreamPreview(
      input.userId,
      input.kind
    );

    return preview ?? null;
  });

export { getStreamPreviewRoute, setStreamPreviewRoute };
