import { useCurrentVoiceChannelId } from '@/features/server/channels/hooks';
import { playSound } from '@/features/server/sounds/actions';
import { SoundType } from '@/features/server/types';
import { joinVoice } from '@/features/server/voice/actions';
import { useOwnVoiceState } from '@/features/server/voice/hooks';
import {
    MICROPHONE_GATE_CLOSE_HOLD_MS,
    MICROPHONE_GATE_DEFAULT_THRESHOLD_DB,
    clampMicrophoneDecibels
} from '@/helpers/audio-gate';
import {
    createDTLNWorkletNode,
    getDTLNWorkletAvailabilitySnapshot,
    markDTLNWorkletUnavailable
} from '@/helpers/audio-worklet/dtln-worklet';
import {
    createNoiseGateWorkletNode,
    getNoiseGateWorkletAvailabilitySnapshot,
    markNoiseGateWorkletUnavailable,
    postNoiseGateWorkletConfig
} from '@/helpers/audio-worklet/noise-gate-worklet';
import {
    createRNNoiseWorkletNode,
    getRNNoiseWorkletAvailabilitySnapshot,
    markRNNoiseWorkletUnavailable
} from '@/helpers/audio-worklet/rnnoise-worklet';
import { logVoice } from '@/helpers/browser-logger';
import { getResWidthHeight } from '@/helpers/get-res-with-height';
import { getTRPCClient } from '@/lib/trpc';
import {
    NoiseSuppressionMode,
    VideoCodec,
    type TRemoteUserStreamKinds
} from '@/types';
import {
    DEFAULT_BITRATE,
    DEFAULT_WEBCAM_BITRATE,
    StreamKind,
    type TStreamQuality,
    type TStreamQualityLayer,
    type TVoiceUserState
} from '@caesar/shared';
import { Device } from 'mediasoup-client';
import type {
    RtpCapabilities,
    RtpCodecCapability
} from 'mediasoup-client/types';
import {
    createContext,
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import { useDevices } from '../devices-provider/hooks/use-devices';
import { SpeakingDetector } from '../speaking-detector';
import { FloatingPinnedCard } from './floating-pinned-card';
import { useLocalStreams } from './hooks/use-local-streams';
import { useRemoteStreams } from './hooks/use-remote-streams';
import {
    useTransportStats,
    type TransportStatsData
} from './hooks/use-transport-stats';
import { useTransports } from './hooks/use-transports';
import { useVoiceControls } from './hooks/use-voice-controls';
import { useVoiceEvents } from './hooks/use-voice-events';
import { MediaControlProvider } from './media-control-context';

// Encoding strategy:
// VP9 / AV1 -> single encoding, L1T3 temporal-only scalability. K-SVC
// (L3T3_KEY) and full SVC (L3T3) have spotty decoder support across
// browsers/hardware; temporal-only works everywhere and still gives the
// SFU layer adaptation for bandwidth. Spatial adaptation is sacrificed.
// VP8 / H264 -> 3-layer spatial simulcast (scaleResolutionDownBy 4/2/1)
// with L1T3 each. SFU picks the right spatial layer per consumer with
// no re-encode.

// Returns the codec the browser will actually use: intersection of
// router caps and browser encoder support, in router preference order.
// Prevents force-pinning VP9/AV1 when the browser lacks an encoder
// (AV1 absent on Safari/Firefox; spotty in Chrome until libaom is
// available; VP9 absent on Safari).
const getEffectiveVideoCodec = (
    routerCaps: RtpCapabilities | null | undefined
): RtpCodecCapability | undefined => {
    if (!routerCaps?.codecs) return undefined;
    const senderCaps =
        typeof RTCRtpSender !== 'undefined' &&
        typeof RTCRtpSender.getCapabilities === 'function'
            ? RTCRtpSender.getCapabilities('video')
            : null;
    const browserMimes = new Set(
        (senderCaps?.codecs ?? []).map((c) => c.mimeType.toLowerCase())
    );
    // when getCapabilities is unavailable, fall back to first router codec
    if (browserMimes.size === 0) {
        return routerCaps.codecs.find((c) => c.kind === 'video');
    }
    return routerCaps.codecs.find(
        (c) => c.kind === 'video' && browserMimes.has(c.mimeType.toLowerCase())
    );
};

const isSingleEncodingMime = (mime: string | undefined): boolean =>
    mime === 'video/vp9' || mime === 'video/av1';

// Map producer encodings into the {spatialLayer,label} tuples the SFU and
// viewer-side picker need. Spatial-layer index matches encoding index, so
// passing the array preserves order and acts as the source of truth.
const buildSpatialQualityLayers = (
    encodings: ReturnType<typeof buildVideoEncodings>,
    opts: { baseHeight: number }
) =>
    encodings.map((enc, idx) => {
        const scale = enc.scaleResolutionDownBy ?? 1;
        const h = Math.max(1, Math.round(opts.baseHeight / scale));
        return { spatialLayer: idx, label: `${h}p` };
    });

const buildVideoEncodings = (opts: {
    maxBitrateBps: number;
    isSingleEncoding: boolean;
    isScreenShare: boolean;
}) => {
    const { maxBitrateBps, isSingleEncoding, isScreenShare } = opts;
    if (isSingleEncoding) {
        return [
            {
                scaleResolutionDownBy: 1,
                maxBitrate: maxBitrateBps,
                scalabilityMode: 'L1T3',
                ...(isScreenShare ? { dtx: true } : {})
            }
        ];
    }
    const ssExtras = isScreenShare ? { dtx: true } : {};
    return [
        {
            scaleResolutionDownBy: 4,
            maxBitrate: Math.max(150_000, Math.floor(maxBitrateBps / 10)),
            scalabilityMode: 'L1T3',
            ...ssExtras
        },
        {
            scaleResolutionDownBy: 2,
            maxBitrate: Math.max(500_000, Math.floor(maxBitrateBps / 3)),
            scalabilityMode: 'L1T3',
            ...ssExtras
        },
        {
            scaleResolutionDownBy: 1,
            maxBitrate: maxBitrateBps,
            scalabilityMode: 'L1T3',
            ...ssExtras
        }
    ];
};

type AudioVideoRefs = {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    audioRef: React.RefObject<HTMLAudioElement | null>;
    screenShareRef: React.RefObject<HTMLVideoElement | null>;
    screenShareAudioRef: React.RefObject<HTMLAudioElement | null>;
    externalAudioRef: React.RefObject<HTMLAudioElement | null>;
    externalVideoRef: React.RefObject<HTMLVideoElement | null>;
};

export type { AudioVideoRefs };

enum ConnectionStatus {
    DISCONNECTED = 'disconnected',
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    FAILED = 'failed'
}

export type TMediaProvider = {
    loading: boolean;
    connectionStatus: ConnectionStatus;
    audioVideoRefsMap: Map<number, AudioVideoRefs>;
    ownVoiceState: TVoiceUserState;
    getOrCreateRefs: (remoteId: number) => AudioVideoRefs;
    getConsumerCodec: (
        remoteId: number,
        kind: StreamKind
    ) => string | undefined;
    isSimulcastConsumer: (remoteId: number, kind: StreamKind) => boolean;
    getStreamQualityLayers: (
        remoteId: number,
        kind: StreamKind
    ) => TStreamQualityLayer[];
    getStreamQuality: (remoteId: number, kind: StreamKind) => TStreamQuality;
    setStreamQuality: (
        remoteId: number,
        kind: StreamKind,
        quality: TStreamQuality
    ) => void;
    pauseConsumer: (remoteId: number, kind: TRemoteUserStreamKinds) => void;
    resumeConsumer: (remoteId: number, kind: TRemoteUserStreamKinds) => void;
    init: (
        routerRtpCapabilities: RtpCapabilities,
        channelId: number
    ) => Promise<void>;
} & Pick<
    ReturnType<typeof useLocalStreams>,
    | 'localAudioStream'
    | 'localVideoStream'
    | 'localScreenShareStream'
    | 'localScreenShareAudioStream'
> &
    Pick<
        ReturnType<typeof useRemoteStreams>,
        'remoteUserStreams' | 'externalStreams'
    > &
    ReturnType<typeof useVoiceControls>;

const DEFAULT_TRANSPORT_STATS: TransportStatsData = {
    producer: null,
    consumer: null,
    screenShare: null,
    totalBytesReceived: 0,
    totalBytesSent: 0,
    isMonitoring: false,
    currentBitrateReceived: 0,
    currentBitrateSent: 0,
    averageBitrateReceived: 0,
    averageBitrateSent: 0
};

const MediaStatsContext = createContext<TransportStatsData>(
    DEFAULT_TRANSPORT_STATS
);

const MediaProviderContext = createContext<TMediaProvider>({
    loading: false,
    connectionStatus: ConnectionStatus.DISCONNECTED,
    audioVideoRefsMap: new Map(),
    getOrCreateRefs: () => ({
        videoRef: { current: null },
        audioRef: { current: null },
        screenShareRef: { current: null },
        screenShareAudioRef: { current: null },
        externalAudioRef: { current: null },
        externalVideoRef: { current: null }
    }),
    getConsumerCodec: () => undefined,
    isSimulcastConsumer: () => false,
    getStreamQualityLayers: () => [],
    getStreamQuality: () => ({ mode: 'auto' }),
    setStreamQuality: () => {},
    pauseConsumer: () => {},
    resumeConsumer: () => {},
    init: () => Promise.resolve(),
    toggleMic: () => Promise.resolve(),
    toggleSound: () => Promise.resolve(),
    toggleWebcam: () => Promise.resolve(),
    toggleScreenShare: () => Promise.resolve(),
    ownVoiceState: {
        micMuted: false,
        soundMuted: false,
        webcamEnabled: false,
        sharingScreen: false
    },
    localAudioStream: undefined,
    localVideoStream: undefined,
    localScreenShareStream: undefined,
    localScreenShareAudioStream: undefined,

    remoteUserStreams: {},
    externalStreams: {}
});

type TMediaProviderProps = {
    children: React.ReactNode;
};

const MediaProvider = memo(({ children }: TMediaProviderProps) => {
    const [loading, setLoading] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
        ConnectionStatus.DISCONNECTED
    );
    const routerRtpCapabilities = useRef<RtpCapabilities | null>(null);
    const audioVideoRefsMap = useRef<Map<number, AudioVideoRefs>>(new Map());
    const ownVoiceState = useOwnVoiceState();
    const currentVoiceChannelId = useCurrentVoiceChannelId();
    const { devices } = useDevices();

    const getOrCreateRefs = useCallback((remoteId: number): AudioVideoRefs => {
        if (!audioVideoRefsMap.current.has(remoteId)) {
            audioVideoRefsMap.current.set(remoteId, {
                videoRef: { current: null },
                audioRef: { current: null },
                screenShareRef: { current: null },
                screenShareAudioRef: { current: null },
                externalAudioRef: { current: null },
                externalVideoRef: { current: null }
            });
        }

        return audioVideoRefsMap.current.get(remoteId)!;
    }, []);

    const {
        addExternalStreamTrack,
        removeExternalStreamTrack,
        removeExternalStream,
        clearExternalStreams,
        addRemoteUserStream,
        removeRemoteUserStream,
        clearRemoteUserStreamsForUser,
        clearRemoteUserStreams,
        externalStreams,
        remoteUserStreams
    } = useRemoteStreams();

    const {
        localAudioProducer,
        localVideoProducer,
        localAudioStream,
        localVideoStream,
        localScreenShareStream,
        localScreenShareAudioStream,
        localScreenShareProducer,
        localScreenShareAudioProducer,
        setLocalAudioStream,
        setLocalVideoStream,
        setLocalScreenShare,
        clearLocalStreams
    } = useLocalStreams();

    const {
        producerTransport,
        consumerTransport,
        createProducerTransport,
        createConsumerTransport,
        consume,
        consumeExistingProducers,
        cleanupTransports,
        getConsumerCodec,
        isSimulcastConsumer,
        getStreamQualityLayers,
        pauseConsumer,
        resumeConsumer
    } = useTransports({
        addExternalStreamTrack,
        removeExternalStreamTrack,
        addRemoteUserStream,
        removeRemoteUserStream
    });

    // Per-stream viewer-side quality picker state, keyed by remoteId-kind.
    // Auto = SFU default per-consumer bandwidth adaptation. Layer = pin a
    // specific spatial layer. Server enforces validity against the
    // producer's published layers; bogus values 400 from set-consumer-quality.
    const [streamQualities, setStreamQualities] = useState<
        Record<string, TStreamQuality>
    >({});

    const qualityKey = useCallback(
        (remoteId: number, kind: StreamKind) => `${remoteId}-${kind}`,
        []
    );

    const getStreamQuality = useCallback(
        (remoteId: number, kind: StreamKind): TStreamQuality =>
            streamQualities[qualityKey(remoteId, kind)] ?? { mode: 'auto' },
        [streamQualities, qualityKey]
    );

    const setStreamQuality = useCallback(
        (remoteId: number, kind: StreamKind, quality: TStreamQuality) => {
            const key = qualityKey(remoteId, kind);
            setStreamQualities((prev) => ({ ...prev, [key]: quality }));
            // Only video-kind consumers support setPreferredLayers; the
            // server route enforces this too, but skip the round-trip.
            if (
                kind !== StreamKind.VIDEO &&
                kind !== StreamKind.SCREEN &&
                kind !== StreamKind.EXTERNAL_VIDEO
            ) {
                return;
            }
            getTRPCClient()
                .voice.setConsumerQuality.mutate({
                    remoteId,
                    kind,
                    quality
                })
                .catch((error) => {
                    logVoice('Error setting consumer quality', { error });
                });
        },
        [qualityKey]
    );

    const {
        stats: transportStats,
        startMonitoring,
        stopMonitoring,
        resetStats,
        setScreenShareProducer
    } = useTransportStats();
    const rawMicrophoneStreamRef = useRef<MediaStream | null>(null);
    const transmitMicrophoneTrackRef = useRef<MediaStreamTrack | null>(null);
    const microphoneNoiseGateAudioContextRef = useRef<AudioContext | null>(
        null
    );
    const microphoneNoiseGateWorkletNodeRef = useRef<AudioWorkletNode | null>(
        null
    );
    const microphoneRNNoiseWorkletNodeRef = useRef<AudioWorkletNode | null>(
        null
    );
    const microphoneDTLNWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
    const micMutedRef = useRef(ownVoiceState.micMuted);

    const syncTransmitMicrophoneTrackState = useCallback(() => {
        const track = transmitMicrophoneTrackRef.current;

        if (!track) return;

        const shouldEnable = !micMutedRef.current;

        if (track.enabled !== shouldEnable) {
            track.enabled = shouldEnable;
        }
    }, []);

    const cleanupMicProcessingResources = useCallback(() => {
        if (microphoneDTLNWorkletNodeRef.current) {
            microphoneDTLNWorkletNodeRef.current.disconnect();
            microphoneDTLNWorkletNodeRef.current = null;
        }

        if (microphoneRNNoiseWorkletNodeRef.current) {
            microphoneRNNoiseWorkletNodeRef.current.port.postMessage({
                type: 'cleanup'
            });
            microphoneRNNoiseWorkletNodeRef.current.disconnect();
            microphoneRNNoiseWorkletNodeRef.current = null;
        }

        if (microphoneNoiseGateWorkletNodeRef.current) {
            microphoneNoiseGateWorkletNodeRef.current.disconnect();
            microphoneNoiseGateWorkletNodeRef.current = null;
        }

        if (microphoneNoiseGateAudioContextRef.current) {
            microphoneNoiseGateAudioContextRef.current.close();
            microphoneNoiseGateAudioContextRef.current = null;
        }

        rawMicrophoneStreamRef.current
            ?.getTracks()
            .forEach((track) => track.stop());
        rawMicrophoneStreamRef.current = null;

        transmitMicrophoneTrackRef.current?.stop();
        transmitMicrophoneTrackRef.current = null;
    }, []);

    useEffect(() => {
        micMutedRef.current = ownVoiceState.micMuted;
        syncTransmitMicrophoneTrackState();
    }, [ownVoiceState.micMuted, syncTransmitMicrophoneTrackState]);

    useEffect(() => {
        if (!microphoneNoiseGateWorkletNodeRef.current) return;

        postNoiseGateWorkletConfig(microphoneNoiseGateWorkletNodeRef.current, {
            enabled: devices.noiseGateEnabled ?? true,
            holdMs: MICROPHONE_GATE_CLOSE_HOLD_MS
        });
    }, [devices.noiseGateEnabled]);

    useEffect(() => {
        if (!microphoneNoiseGateWorkletNodeRef.current) return;

        postNoiseGateWorkletConfig(microphoneNoiseGateWorkletNodeRef.current, {
            thresholdDb: clampMicrophoneDecibels(
                devices.noiseGateThresholdDb ??
                    MICROPHONE_GATE_DEFAULT_THRESHOLD_DB
            )
        });
    }, [devices.noiseGateThresholdDb]);

    const startMicStream = useCallback(async () => {
        try {
            logVoice('Starting microphone stream');
            cleanupMicProcessingResources();

            const shouldUseNoiseGate = !!devices.noiseGateEnabled;
            const shouldUseRNNoise =
                devices.noiseSuppressionMode === NoiseSuppressionMode.RNNOISE;
            const shouldUseDTLN =
                devices.noiseSuppressionMode === NoiseSuppressionMode.DTLN;
            const advancedNsActive = shouldUseRNNoise || shouldUseDTLN;

            const hasSpecificMic =
                !!devices.microphoneId && devices.microphoneId !== 'default';

            // DTLN runs natively at 16kHz, RNNoise at 48kHz. Match the whole
            // pipeline (getUserMedia hint + AudioContext + gate) to the mode
            // so there is exactly one context and zero cross-context handoff.
            const pipelineSampleRate = shouldUseDTLN ? 16000 : 48000;

            const rawStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: hasSpecificMic
                        ? { exact: devices.microphoneId }
                        : undefined,
                    autoGainControl: devices.autoGainControl,
                    echoCancellation: devices.echoCancellation,
                    // Disable browser-level noise suppression whenever an
                    // advanced mode is on. Stacking two denoisers produces
                    // speech smear / musical-noise artifacts.
                    noiseSuppression:
                        devices.noiseSuppression && !advancedNsActive,
                    sampleRate: shouldUseDTLN ? 16000 : undefined,
                    channelCount: 1
                },
                video: false
            });

            logVoice('Microphone stream obtained', { stream: rawStream });

            const rawAudioTrack = rawStream.getAudioTracks()[0];

            if (rawAudioTrack) {
                const noiseGateAvailability =
                    getNoiseGateWorkletAvailabilitySnapshot();
                const rnnoiseAvailability =
                    getRNNoiseWorkletAvailabilitySnapshot();
                const dtlnAvailability = getDTLNWorkletAvailabilitySnapshot();
                let transmitTrack: MediaStreamTrack = rawAudioTrack;
                let transmitStream: MediaStream = rawStream;

                const needsProcessing =
                    (shouldUseNoiseGate && noiseGateAvailability.available) ||
                    (shouldUseRNNoise && rnnoiseAvailability.available) ||
                    (shouldUseDTLN && dtlnAvailability.available);

                if (needsProcessing) {
                    let audioContext: AudioContext | null = null;

                    try {
                        audioContext = new window.AudioContext({
                            sampleRate: pipelineSampleRate
                        });
                        const source =
                            audioContext.createMediaStreamSource(rawStream);
                        const destination =
                            audioContext.createMediaStreamDestination();

                        let currentNode: AudioNode = source;

                        // DTLN first (only enabled in 16k pipeline)
                        if (shouldUseDTLN && dtlnAvailability.available) {
                            try {
                                const dtlnNode =
                                    await createDTLNWorkletNode(audioContext);

                                currentNode.connect(dtlnNode);
                                currentNode = dtlnNode;
                                microphoneDTLNWorkletNodeRef.current = dtlnNode;

                                logVoice(
                                    'DTLN initialized at 16kHz, noise suppression active.'
                                );
                            } catch (error) {
                                logVoice(
                                    'DTLN failed to initialize, noise suppression not active.',
                                    error
                                );
                                markDTLNWorkletUnavailable(
                                    'Failed to initialize the DTLN audio processor.'
                                );
                            }
                        } else if (
                            shouldUseDTLN &&
                            !dtlnAvailability.available
                        ) {
                            logVoice(
                                'DTLN unavailable, skipping noise suppression.',
                                dtlnAvailability.reason
                            );
                        }

                        // RNNoise (only enabled in 48k pipeline)
                        if (shouldUseRNNoise && rnnoiseAvailability.available) {
                            try {
                                const rnnoiseNode =
                                    await createRNNoiseWorkletNode(
                                        audioContext,
                                        { enabled: true }
                                    );

                                currentNode.connect(rnnoiseNode);
                                currentNode = rnnoiseNode;
                                microphoneRNNoiseWorkletNodeRef.current =
                                    rnnoiseNode;

                                logVoice(
                                    'RNNoise initialized, noise suppression active.'
                                );
                            } catch (error) {
                                logVoice(
                                    'RNNoise failed to initialize, noise suppression not active.',
                                    error
                                );
                                markRNNoiseWorkletUnavailable(
                                    'Failed to initialize the RNNoise audio processor.'
                                );
                            }
                        } else if (
                            shouldUseRNNoise &&
                            !rnnoiseAvailability.available
                        ) {
                            console.warn(
                                '%c[RNNOISE] Unavailable skipping noise suppression:',
                                'color: orange; font-weight: bold;',
                                rnnoiseAvailability.reason
                            );
                        }

                        // Noise gate second
                        if (
                            shouldUseNoiseGate &&
                            noiseGateAvailability.available
                        ) {
                            try {
                                const noiseGateNode =
                                    await createNoiseGateWorkletNode(
                                        audioContext,
                                        {
                                            enabled: true,
                                            thresholdDb:
                                                clampMicrophoneDecibels(
                                                    devices.noiseGateThresholdDb ??
                                                        MICROPHONE_GATE_DEFAULT_THRESHOLD_DB
                                                ),
                                            holdMs: MICROPHONE_GATE_CLOSE_HOLD_MS
                                        }
                                    );

                                currentNode.connect(noiseGateNode);
                                currentNode = noiseGateNode;
                                microphoneNoiseGateWorkletNodeRef.current =
                                    noiseGateNode;
                            } catch (error) {
                                logVoice(
                                    'Failed to initialize noise gate worklet, continuing without it',
                                    { error }
                                );
                                markNoiseGateWorkletUnavailable(
                                    'Failed to initialize the noise gate audio processor.'
                                );
                            }
                        } else if (
                            shouldUseNoiseGate &&
                            !noiseGateAvailability.available
                        ) {
                            logVoice(
                                'Noise gate unavailable, skipping noise gate',
                                {
                                    reason: noiseGateAvailability.reason
                                }
                            );
                        }

                        currentNode.connect(destination);

                        const processedTrack =
                            destination.stream.getAudioTracks()[0];

                        if (processedTrack) {
                            rawMicrophoneStreamRef.current = rawStream;
                            microphoneNoiseGateAudioContextRef.current =
                                audioContext;
                            transmitTrack = processedTrack;
                            transmitStream = destination.stream;
                        } else {
                            microphoneDTLNWorkletNodeRef.current?.disconnect();
                            microphoneDTLNWorkletNodeRef.current = null;
                            microphoneRNNoiseWorkletNodeRef.current?.disconnect();
                            microphoneRNNoiseWorkletNodeRef.current = null;
                            microphoneNoiseGateWorkletNodeRef.current?.disconnect();
                            microphoneNoiseGateWorkletNodeRef.current = null;
                            audioContext.close();
                            audioContext = null;
                            logVoice(
                                'Audio processing produced no audio track, using raw mic stream'
                            );
                        }
                    } catch (error) {
                        if (audioContext) {
                            audioContext.close();
                        }

                        logVoice(
                            'Failed to initialize audio processing pipeline, using raw mic stream',
                            { error }
                        );
                    }
                }

                transmitMicrophoneTrackRef.current = transmitTrack;
                setLocalAudioStream(transmitStream);
                syncTransmitMicrophoneTrackState();

                logVoice('Obtained audio track', { audioTrack: rawAudioTrack });

                const existingProducer = localAudioProducer.current;

                if (existingProducer && !existingProducer.closed) {
                    // Reuse the live producer: swap the fresh mic track in
                    // rather than building a new one. Keeps producer.id stable
                    // across re-acquire (unmute after the mic track dropped
                    // while muted), so the server never fans out
                    // VOICE_NEW_PRODUCER and listeners never re-consume, which
                    // is what triggered the cross-worker pipe race.
                    await existingProducer.replaceTrack({
                        track: transmitTrack
                    });
                } else {
                    localAudioProducer.current =
                        await producerTransport.current?.produce({
                            track: transmitTrack,
                            // disableTrackOnPause:false so mediasoup-client never
                            // flips track.enabled on its own. Mute is owned
                            // solely by syncTransmitMicrophoneTrackState, and
                            // replaceTrack must not fight it.
                            disableTrackOnPause: false,
                            codecOptions: {
                                opusStereo: false,
                                opusFec: true,
                                opusDtx: false,
                                opusMaxPlaybackRate: 48000,
                                opusMaxAverageBitrate: 128000
                            },
                            appData: { kind: StreamKind.AUDIO }
                        });

                    logVoice('Microphone audio producer created', {
                        producer: localAudioProducer.current
                    });

                    localAudioProducer.current?.on('@close', async () => {
                        logVoice('Audio producer closed');

                        // teardown race: this handler can fire after the WS+trpc
                        // cleanup has already run (kick / disconnect / refresh).
                        // wrap getTRPCClient too so the null-client throw doesn't
                        // escape as an unhandled rejection.
                        try {
                            await getTRPCClient().voice.closeProducer.mutate({
                                kind: StreamKind.AUDIO
                            });
                        } catch (error) {
                            logVoice('Error closing audio producer', { error });
                        }
                    });
                }

                rawAudioTrack.onended = () => {
                    logVoice('Audio track ended, cleaning up microphone');

                    transmitStream.getAudioTracks().forEach((track) => {
                        track.stop();
                    });
                    cleanupMicProcessingResources();
                    // Keep the producer alive (do not close) so the next
                    // unmute can replaceTrack into it and preserve producer.id,
                    // avoiding a re-consume fanout. It is closed for real on
                    // leave via clearLocalStreams.
                    setLocalAudioStream(undefined);
                };
            } else {
                rawStream.getTracks().forEach((track) => track.stop());
                throw new Error('Failed to obtain audio track from microphone');
            }
        } catch (error) {
            cleanupMicProcessingResources();
            setLocalAudioStream(undefined);
            logVoice('Error starting microphone stream', { error });
        }
    }, [
        cleanupMicProcessingResources,
        producerTransport,
        setLocalAudioStream,
        localAudioProducer,
        syncTransmitMicrophoneTrackState,
        devices.microphoneId,
        devices.autoGainControl,
        devices.echoCancellation,
        devices.noiseSuppression,
        devices.noiseGateEnabled,
        devices.noiseGateThresholdDb,
        devices.noiseSuppressionMode
    ]);

    const startWebcamStream = useCallback(async () => {
        try {
            logVoice('Starting webcam stream');

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    deviceId: { exact: devices?.webcamId },
                    frameRate: devices.webcamFramerate,
                    ...getResWidthHeight(devices?.webcamResolution)
                }
            });

            logVoice('Webcam stream obtained', { stream });

            setLocalVideoStream(stream);

            const videoTrack = stream.getVideoTracks()[0];

            if (videoTrack) {
                logVoice('Obtained video track', { videoTrack });

                // Don't force a codec. Let mediasoup-client pick the first
                // router codec the browser can actually encode.
                const effectiveCodec = getEffectiveVideoCodec(
                    routerRtpCapabilities.current
                );
                const effectiveMime = effectiveCodec?.mimeType.toLowerCase();
                // simulcast off -> single full-quality stream (lighter on
                // sender CPU/upload, no spatial layers for the SFU to switch)
                const webcamSingleEncoding =
                    isSingleEncodingMime(effectiveMime) ||
                    !devices.simulcastEnabled;
                const webcamMaxBitrateKbps =
                    devices.webcamBitrate ?? DEFAULT_WEBCAM_BITRATE;

                logVoice('Webcam codec resolved', {
                    effectiveMime,
                    webcamSingleEncoding
                });

                const webcamEncodings = buildVideoEncodings({
                    maxBitrateBps: webcamMaxBitrateKbps * 1000,
                    isSingleEncoding: webcamSingleEncoding,
                    isScreenShare: false
                });
                const webcamQualityLayers = webcamSingleEncoding
                    ? undefined
                    : buildSpatialQualityLayers(webcamEncodings, {
                          baseHeight: getResWidthHeight(
                              devices?.webcamResolution
                          ).height
                      });

                localVideoProducer.current =
                    await producerTransport.current?.produce({
                        track: videoTrack,
                        encodings: webcamEncodings,
                        codecOptions: {
                            videoGoogleStartBitrate: Math.min(
                                1000,
                                webcamMaxBitrateKbps
                            )
                        },
                        appData: {
                            kind: StreamKind.VIDEO,
                            qualityLayers: webcamQualityLayers
                        }
                    });

                logVoice('Webcam video producer created', {
                    producer: localVideoProducer.current
                });

                localVideoProducer.current?.on('@close', async () => {
                    logVoice('Video producer closed');

                    // teardown race: see audio handler comment.
                    try {
                        await getTRPCClient().voice.closeProducer.mutate({
                            kind: StreamKind.VIDEO
                        });
                    } catch (error) {
                        logVoice('Error closing video producer', { error });
                    }
                });

                videoTrack.onended = () => {
                    logVoice('Video track ended, cleaning up webcam');

                    localVideoStream?.getVideoTracks().forEach((track) => {
                        track.stop();
                    });
                    localVideoProducer.current?.close();

                    setLocalVideoStream(undefined);
                };
            } else {
                throw new Error('Failed to obtain video track from webcam');
            }
        } catch (error) {
            logVoice('Error starting webcam stream', { error });
            throw error;
        }
    }, [
        setLocalVideoStream,
        localVideoProducer,
        producerTransport,
        localVideoStream,
        devices.webcamId,
        devices.webcamFramerate,
        devices.webcamResolution,
        devices.webcamBitrate,
        devices.simulcastEnabled
    ]);

    const stopWebcamStream = useCallback(() => {
        logVoice('Stopping webcam stream');

        localVideoStream?.getVideoTracks().forEach((track) => {
            logVoice('Stopping video track', { track });

            track.stop();
            localVideoStream.removeTrack(track);
        });

        localVideoProducer.current?.close();
        localVideoProducer.current = undefined;

        setLocalVideoStream(undefined);
    }, [localVideoStream, setLocalVideoStream, localVideoProducer]);

    const stopScreenShareStream = useCallback(() => {
        logVoice('Stopping screen share stream');

        localScreenShareStream?.getTracks().forEach((track) => {
            logVoice('Stopping screen share track', { track });

            track.stop();
            localScreenShareStream.removeTrack(track);
        });

        localScreenShareProducer.current?.close();
        localScreenShareProducer.current = undefined;

        setScreenShareProducer(null);
        setLocalScreenShare(undefined);
    }, [
        localScreenShareStream,
        setLocalScreenShare,
        localScreenShareProducer,
        setScreenShareProducer
    ]);

    const startScreenShareStream = useCallback(async () => {
        try {
            logVoice('Starting screen share stream');

            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    ...getResWidthHeight(devices?.screenResolution),
                    frameRate: devices?.screenFramerate
                },
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    channelCount: 2,
                    sampleRate: 48000
                }
            });

            logVoice('Screen share stream obtained', { stream });
            setLocalScreenShare(stream);

            const videoTrack = stream.getVideoTracks()[0];
            const audioTrack = stream.getAudioTracks()[0];

            if (videoTrack) {
                logVoice('Obtained video track', { videoTrack });

                // Resolve effective codec: user-preferred (if browser can
                // encode it) → browser/router intersection → undefined.
                const userPreferredMime =
                    devices.screenCodec &&
                    devices.screenCodec !== VideoCodec.AUTO
                        ? devices.screenCodec.toLowerCase()
                        : undefined;
                const browserSupportedCodec = getEffectiveVideoCodec(
                    routerRtpCapabilities.current
                );
                let preferredCodec: RtpCodecCapability | undefined;
                if (
                    userPreferredMime &&
                    routerRtpCapabilities.current?.codecs
                ) {
                    const senderCaps =
                        typeof RTCRtpSender !== 'undefined' &&
                        typeof RTCRtpSender.getCapabilities === 'function'
                            ? RTCRtpSender.getCapabilities('video')
                            : null;
                    const browserCanEncode =
                        !senderCaps ||
                        senderCaps.codecs.some(
                            (c) =>
                                c.mimeType.toLowerCase() === userPreferredMime
                        );
                    if (browserCanEncode) {
                        preferredCodec =
                            routerRtpCapabilities.current.codecs.find(
                                (c) =>
                                    c.mimeType.toLowerCase() ===
                                    userPreferredMime
                            );
                        if (preferredCodec) {
                            logVoice('Using preferred screen share codec', {
                                codec: preferredCodec.mimeType
                            });
                        }
                    } else {
                        logVoice(
                            'Browser cannot encode preferred screen codec, falling back',
                            { userPreferredMime }
                        );
                    }
                }

                const maxBitrateKbps = devices.screenBitrate ?? DEFAULT_BITRATE;

                const ssCodecMime =
                    preferredCodec?.mimeType.toLowerCase() ??
                    browserSupportedCodec?.mimeType.toLowerCase();
                const ssSingleEncoding =
                    isSingleEncodingMime(ssCodecMime) ||
                    !devices.simulcastEnabled;

                const ssEncodings = buildVideoEncodings({
                    maxBitrateBps: maxBitrateKbps * 1000,
                    isSingleEncoding: ssSingleEncoding,
                    isScreenShare: true
                });
                const ssQualityLayers = ssSingleEncoding
                    ? undefined
                    : buildSpatialQualityLayers(ssEncodings, {
                          baseHeight: getResWidthHeight(
                              devices?.screenResolution
                          ).height
                      });

                localScreenShareProducer.current =
                    await producerTransport.current?.produce({
                        track: videoTrack,
                        codec: preferredCodec,
                        encodings: ssEncodings,
                        codecOptions: {
                            videoGoogleStartBitrate: Math.min(
                                2000,
                                maxBitrateKbps
                            ),
                            videoGoogleMaxBitrate: maxBitrateKbps,
                            videoGoogleMinBitrate: Math.min(200, maxBitrateKbps)
                        },
                        appData: {
                            kind: StreamKind.SCREEN,
                            qualityLayers: ssQualityLayers
                        }
                    });

                setScreenShareProducer(localScreenShareProducer.current);

                localScreenShareProducer.current?.on('@close', async () => {
                    logVoice('Screen share producer closed');

                    // teardown race: see audio handler comment.
                    try {
                        await getTRPCClient().voice.closeProducer.mutate({
                            kind: StreamKind.SCREEN
                        });
                    } catch (error) {
                        logVoice('Error closing screen share producer', {
                            error
                        });
                    }
                });

                videoTrack.onended = () => {
                    logVoice(
                        'Screen share track ended, cleaning up screen share'
                    );

                    localScreenShareStream?.getTracks().forEach((track) => {
                        track.stop();
                    });
                    localScreenShareProducer.current?.close();

                    setScreenShareProducer(null);
                    setLocalScreenShare(undefined);
                };

                if (audioTrack) {
                    logVoice('Obtained audio track', { audioTrack });

                    localScreenShareAudioProducer.current =
                        await producerTransport.current?.produce({
                            track: audioTrack,
                            codecOptions: {
                                opusStereo: true,
                                opusFec: true,
                                opusDtx: false,
                                opusMaxPlaybackRate: 48000,
                                opusMaxAverageBitrate: 128000
                            },
                            appData: { kind: StreamKind.SCREEN_AUDIO }
                        });

                    audioTrack.onended = () => {
                        localScreenShareAudioProducer.current?.close();
                        localScreenShareAudioProducer.current = undefined;
                    };
                }

                return videoTrack;
            } else {
                throw new Error('No video track obtained for screen share');
            }
        } catch (error) {
            logVoice('Error starting screen share stream', { error });
            throw error;
        }
    }, [
        setLocalScreenShare,
        localScreenShareProducer,
        localScreenShareAudioProducer,
        producerTransport,
        localScreenShareStream,
        setScreenShareProducer,
        devices.screenResolution,
        devices.screenFramerate,
        devices.screenCodec,
        devices.screenBitrate,
        devices.simulcastEnabled
    ]);

    const cleanup = useCallback(() => {
        logVoice('Running voice provider cleanup');

        stopMonitoring();
        resetStats();
        cleanupMicProcessingResources();
        clearLocalStreams();
        clearRemoteUserStreams();
        clearExternalStreams();
        cleanupTransports();

        setConnectionStatus(ConnectionStatus.DISCONNECTED);
    }, [
        stopMonitoring,
        resetStats,
        cleanupMicProcessingResources,
        clearLocalStreams,
        clearRemoteUserStreams,
        clearExternalStreams,
        cleanupTransports
    ]);

    const init = useCallback(
        async (
            incomingRouterRtpCapabilities: RtpCapabilities,
            channelId: number
        ) => {
            logVoice('Initializing voice provider', {
                incomingRouterRtpCapabilities,
                channelId
            });

            cleanup();

            try {
                setLoading(true);
                setConnectionStatus(ConnectionStatus.CONNECTING);

                routerRtpCapabilities.current = incomingRouterRtpCapabilities;

                const device = new Device();

                await device.load({
                    routerRtpCapabilities: incomingRouterRtpCapabilities
                });

                await createProducerTransport(device);
                await createConsumerTransport(device);
                await consumeExistingProducers(incomingRouterRtpCapabilities);
                await startMicStream();

                startMonitoring(
                    producerTransport.current,
                    consumerTransport.current
                );
                setConnectionStatus(ConnectionStatus.CONNECTED);
                setLoading(false);
                playSound(SoundType.OWN_USER_JOINED_VOICE_CHANNEL);
            } catch (error) {
                logVoice('Error initializing voice provider', { error });

                setConnectionStatus(ConnectionStatus.FAILED);
                setLoading(false);

                throw error;
            }
        },
        [
            cleanup,
            createProducerTransport,
            createConsumerTransport,
            consumeExistingProducers,
            startMicStream,
            startMonitoring,
            producerTransport,
            consumerTransport
        ]
    );

    // A moderator dragged us into another voice channel. Re-run the join flow
    // for the destination; joinVoice() leaves the current channel first. Only
    // active while in voice (the server only moves users already connected).
    useEffect(() => {
        if (!currentVoiceChannelId) return;

        const sub = getTRPCClient().voice.onForceMove.subscribe(undefined, {
            onData: async ({ channelId }) => {
                try {
                    const response = await joinVoice(channelId);
                    if (response) await init(response, channelId);
                } catch (error) {
                    logVoice('Error handling forced voice move', { error });
                }
            }
        });

        return () => sub.unsubscribe();
    }, [currentVoiceChannelId, init]);

    const { toggleMic, toggleSound, toggleWebcam, toggleScreenShare } =
        useVoiceControls({
            startMicStream,
            localAudioStream,
            startWebcamStream,
            stopWebcamStream,
            startScreenShareStream,
            stopScreenShareStream
        });

    useVoiceEvents({
        consume,
        removeRemoteUserStream,
        removeExternalStreamTrack,
        removeExternalStream,
        clearRemoteUserStreamsForUser,
        rtpCapabilities: routerRtpCapabilities.current!
    });

    useEffect(() => {
        return () => {
            logVoice('Voice provider unmounting, cleaning up resources');
            cleanup();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const prevVoiceChannelId = useRef(currentVoiceChannelId);

    useEffect(() => {
        const wasInChannel = prevVoiceChannelId.current !== undefined;
        const leftChannel = currentVoiceChannelId === undefined;

        prevVoiceChannelId.current = currentVoiceChannelId;

        if (wasInChannel && leftChannel) {
            logVoice('Left voice channel, cleaning up resources');
            cleanup();
        }
    }, [currentVoiceChannelId, cleanup]);

    const contextValue = useMemo<TMediaProvider>(
        () => ({
            loading,
            connectionStatus,
            audioVideoRefsMap: audioVideoRefsMap.current,
            getOrCreateRefs,
            getConsumerCodec,
            isSimulcastConsumer,
            getStreamQualityLayers,
            getStreamQuality,
            setStreamQuality,
            pauseConsumer,
            resumeConsumer,
            init,

            toggleMic,
            toggleSound,
            toggleWebcam,
            toggleScreenShare,
            ownVoiceState,

            localAudioStream,
            localVideoStream,
            localScreenShareStream,
            localScreenShareAudioStream,

            remoteUserStreams,
            externalStreams
        }),
        [
            loading,
            connectionStatus,
            getOrCreateRefs,
            getConsumerCodec,
            isSimulcastConsumer,
            getStreamQualityLayers,
            getStreamQuality,
            setStreamQuality,
            pauseConsumer,
            resumeConsumer,
            init,

            toggleMic,
            toggleSound,
            toggleWebcam,
            toggleScreenShare,
            ownVoiceState,

            localAudioStream,
            localVideoStream,
            localScreenShareStream,
            localScreenShareAudioStream,
            remoteUserStreams,
            externalStreams
        ]
    );

    return (
        <MediaProviderContext.Provider value={contextValue}>
            <MediaStatsContext.Provider value={transportStats}>
                <MediaControlProvider>
                    <div className="relative">
                        <SpeakingDetector />
                        <FloatingPinnedCard
                            remoteUserStreams={remoteUserStreams}
                            externalStreams={externalStreams}
                            localScreenShareStream={localScreenShareStream}
                            localVideoStream={localVideoStream}
                        />
                        {children}
                    </div>
                </MediaControlProvider>
            </MediaStatsContext.Provider>
        </MediaProviderContext.Provider>
    );
});

export { MediaProvider, MediaProviderContext, MediaStatsContext };
