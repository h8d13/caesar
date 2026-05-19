import { useOwnVoiceUser } from '@/features/server/hooks';
import { useEffect, useRef, useState } from 'react';

// Speaking intensity buckets. The only externally observed signals are
// isSpeaking and speakingIntensity, so we compute the bucket inside the RAF
// loop and only setState when it flips. Saves ~60 re-renders/sec per voice
// card, which previously cascaded through redux (setUserSpeaking) to every
// subscriber of that user's speaking state.
enum SpeakingIntensity {
    Silent = 0,
    Quiet = 1,
    Normal = 2,
    Loud = 3
}

const ANALYZER_FFT_SIZE = 512;
const ANALYZER_MIN_DECIBELS = -90;
const ANALYZER_MAX_DECIBELS = -10;
const ANALYZER_SMOOTHING_TIME_CONSTANT = 0.85;
const SPEAKING_THRESHOLD = 8;

// Sample at 15 Hz. The downstream signal is a 4-level bucket; faster sampling
// only matters for onset detection, where ~66 ms latency is imperceptible.
const SAMPLE_INTERVAL_MS = 1000 / 15;

const bucketOf = (normalizedLevel: number): SpeakingIntensity => {
    if (normalizedLevel <= SPEAKING_THRESHOLD) return SpeakingIntensity.Silent;
    if (normalizedLevel < 15) return SpeakingIntensity.Quiet;
    if (normalizedLevel < 30) return SpeakingIntensity.Normal;
    return SpeakingIntensity.Loud;
};

const useAudioLevel = (audioStream: MediaStream | undefined) => {
    const [speakingIntensity, setSpeakingIntensity] = useState(
        SpeakingIntensity.Silent
    );
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const ownVoiceUser = useOwnVoiceUser();

    useEffect(() => {
        if (!audioStream || ownVoiceUser?.state.soundMuted) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- reset analyzer state when stream is removed or muted
            setSpeakingIntensity(SpeakingIntensity.Silent);
            return;
        }

        try {
            const AudioContextClass =
                window.AudioContext ||
                (
                    window as typeof window & {
                        webkitAudioContext?: typeof AudioContext;
                    }
                ).webkitAudioContext;

            const audioContext = new AudioContextClass();
            const analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(audioStream);

            analyser.fftSize = ANALYZER_FFT_SIZE;
            analyser.minDecibels = ANALYZER_MIN_DECIBELS;
            analyser.maxDecibels = ANALYZER_MAX_DECIBELS;
            analyser.smoothingTimeConstant = ANALYZER_SMOOTHING_TIME_CONSTANT;

            source.connect(analyser);

            audioContextRef.current = audioContext;
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            let lastBucket: SpeakingIntensity = SpeakingIntensity.Silent;
            let lastTick = 0;

            const checkAudioLevel = (now: number) => {
                if (!analyserRef.current) return;

                if (now - lastTick >= SAMPLE_INTERVAL_MS) {
                    lastTick = now;

                    analyserRef.current.getByteFrequencyData(dataArray);

                    let sum = 0;
                    for (let i = 0; i < dataArray.length; i++) {
                        sum += dataArray[i] * dataArray[i];
                    }

                    const rms = Math.sqrt(sum / dataArray.length);
                    const normalizedLevel = Math.min(100, (rms / 255) * 100);
                    const bucket = bucketOf(normalizedLevel);

                    if (bucket !== lastBucket) {
                        lastBucket = bucket;
                        setSpeakingIntensity(bucket);
                    }
                }

                animationFrameRef.current =
                    requestAnimationFrame(checkAudioLevel);
            };

            animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
        } catch (error) {
            console.warn('Audio level detection not supported:', error);
        }

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }

            if (audioContextRef.current) {
                audioContextRef.current.close();
            }

            setSpeakingIntensity(SpeakingIntensity.Silent);
        };
    }, [audioStream, ownVoiceUser?.state.soundMuted]);

    return {
        isSpeaking: speakingIntensity !== SpeakingIntensity.Silent,
        speakingIntensity
    };
};

export { useAudioLevel };
