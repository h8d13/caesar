import type { TRemoteUserStreamKinds } from '@/types';
import type {
    StreamKind,
    TStreamQuality,
    TStreamQualityLayer,
    TVoiceUserState
} from '@caesar/shared';
import type { RtpCapabilities } from 'mediasoup-client/types';
import { createContext } from 'react';
import type { useLocalStreams } from './hooks/use-local-streams';
import type { useRemoteStreams } from './hooks/use-remote-streams';
import type { TransportStatsData } from './hooks/use-transport-stats';
import type { useVoiceControls } from './hooks/use-voice-controls';

type AudioVideoRefs = {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    audioRef: React.RefObject<HTMLAudioElement | null>;
    screenShareRef: React.RefObject<HTMLVideoElement | null>;
    screenShareAudioRef: React.RefObject<HTMLAudioElement | null>;
    externalAudioRef: React.RefObject<HTMLAudioElement | null>;
    externalVideoRef: React.RefObject<HTMLVideoElement | null>;
};

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

export { ConnectionStatus, MediaProviderContext, MediaStatsContext };
export type { AudioVideoRefs };
