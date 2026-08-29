import { pickRecordingFormat } from '@/helpers/voice-recording';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

// hard stop so a forgotten recording cannot grow past the server's upload
// size limit while nobody is watching the timer.
const MAX_RECORDING_MS = 5 * 60 * 1000;
const TICK_MS = 200;

const useVoiceRecorder = (onRecorded: (file: File) => void) => {
    const onRecordedRef = useRef(onRecorded);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const cancelledRef = useRef(false);
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [elapsedMs, setElapsedMs] = useState(0);

    useEffect(() => {
        onRecordedRef.current = onRecorded;
    });

    const stopTicking = useCallback(() => {
        if (tickRef.current === null) return;

        clearInterval(tickRef.current);
        tickRef.current = null;
    }, []);

    const startRecording = useCallback(async () => {
        if (recorderRef.current) return;

        const format = pickRecordingFormat((mimeType) =>
            MediaRecorder.isTypeSupported(mimeType)
        );

        if (!format) {
            toast.error('Voice messages are not supported in this browser.');
            return;
        }

        let stream: MediaStream;

        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            console.error('microphone access failed', err);
            toast.error('Could not access the microphone.');
            return;
        }

        const recorder = new MediaRecorder(stream, {
            mimeType: format.mimeType
        });
        const chunks: Blob[] = [];

        recorder.addEventListener('dataavailable', (event) => {
            if (event.data.size > 0) chunks.push(event.data);
        });

        // single teardown point: every exit path (stop, cancel, auto-stop,
        // unmount) routes through recorder.stop() and lands here, so the
        // mic track is released once and the tab drops its recording dot.
        recorder.addEventListener('stop', () => {
            for (const track of stream.getTracks()) {
                track.stop();
            }

            recorderRef.current = null;
            stopTicking();
            setIsRecording(false);
            setElapsedMs(0);

            if (cancelledRef.current || !chunks.length) return;

            const file = new File(
                [new Blob(chunks, { type: format.mimeType })],
                `voice-message${format.extension}`,
                { type: format.mimeType }
            );

            onRecordedRef.current(file);
        });

        const startedAt = Date.now();

        recorderRef.current = recorder;
        cancelledRef.current = false;
        setElapsedMs(0);
        setIsRecording(true);
        recorder.start();

        tickRef.current = setInterval(() => {
            const elapsed = Date.now() - startedAt;

            setElapsedMs(elapsed);

            if (elapsed >= MAX_RECORDING_MS) recorderRef.current?.stop();
        }, TICK_MS);
    }, [stopTicking]);

    const stopRecording = useCallback(() => {
        recorderRef.current?.stop();
    }, []);

    const cancelRecording = useCallback(() => {
        cancelledRef.current = true;
        recorderRef.current?.stop();
    }, []);

    useEffect(
        () => () => {
            cancelledRef.current = true;
            recorderRef.current?.stop();
        },
        []
    );

    return useMemo(
        () => ({
            isRecording,
            elapsedMs,
            startRecording,
            stopRecording,
            cancelRecording
        }),
        [isRecording, elapsedMs, startRecording, stopRecording, cancelRecording]
    );
};

export { useVoiceRecorder };
