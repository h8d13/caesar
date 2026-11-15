import { logVoice } from '@/helpers/browser-logger';
import { getTRPCClient } from '@/lib/trpc';
import {
    STREAM_PREVIEW_INTERVAL_MS,
    STREAM_PREVIEW_MAX_WIDTH,
    type StreamKind
} from '@caesar/shared';
import { memo, useEffect } from 'react';

// first still once the track has produced frames; also the retry delay
// while the server does not know the producer yet (produce is async)
const FIRST_CAPTURE_DELAY_MS = 1_500;
const MAX_EARLY_RETRIES = 5;
const JPEG_QUALITY = 0.7;

type TStreamPreviewUploaderProps = {
    stream: MediaStream | undefined;
    kind: StreamKind.VIDEO | StreamKind.SCREEN;
};

// Uploads a downscaled still of our own camera / screen share every few
// seconds, so users outside the call can hover us for a preview. Reads from
// a detached <video> on the local stream: no extra capture, no DOM node.
const StreamPreviewUploader = memo(
    ({ stream, kind }: TStreamPreviewUploaderProps) => {
        useEffect(() => {
            if (!stream) return;

            const video = document.createElement('video');
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            let timer: ReturnType<typeof setTimeout> | undefined;
            let stopped = false;
            let stored = false;
            let earlyRetries = 0;

            video.muted = true;
            video.playsInline = true;
            video.srcObject = stream;
            video.play().catch(() => {
                // muted autoplay of a local stream; a refusal only means no
                // previews, the call itself is unaffected
            });

            const capture = async () => {
                if (stopped || !context) return;

                let uploaded = false;
                const { videoWidth, videoHeight } = video;
                const live = stream
                    .getVideoTracks()
                    .some((track) => track.readyState === 'live');

                if (live && videoWidth > 0 && videoHeight > 0) {
                    const scale = Math.min(
                        1,
                        STREAM_PREVIEW_MAX_WIDTH / videoWidth
                    );

                    canvas.width = Math.round(videoWidth * scale);
                    canvas.height = Math.round(videoHeight * scale);
                    context.drawImage(video, 0, 0, canvas.width, canvas.height);

                    try {
                        const result =
                            await getTRPCClient().voice.setStreamPreview.mutate(
                                {
                                    kind,
                                    image: canvas.toDataURL(
                                        'image/jpeg',
                                        JPEG_QUALITY
                                    )
                                }
                            );

                        uploaded = result.stored;
                    } catch (error) {
                        // left the call or the stream closed mid-upload
                        logVoice('Stream preview upload failed', { error });
                    }
                }

                if (stopped) return;

                if (uploaded) stored = true;

                const retrySoon = !stored && earlyRetries++ < MAX_EARLY_RETRIES;

                timer = setTimeout(
                    capture,
                    retrySoon
                        ? FIRST_CAPTURE_DELAY_MS
                        : STREAM_PREVIEW_INTERVAL_MS
                );
            };

            timer = setTimeout(capture, FIRST_CAPTURE_DELAY_MS);

            return () => {
                stopped = true;
                clearTimeout(timer);
                video.pause();
                video.srcObject = null;
            };
        }, [stream, kind]);

        return null;
    }
);

StreamPreviewUploader.displayName = 'StreamPreviewUploader';

export { StreamPreviewUploader };
