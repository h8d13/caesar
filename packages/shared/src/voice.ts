import type {
  DtlsParameters,
  IceCandidate,
  IceParameters
} from 'mediasoup/types';

export type TVoiceUserState = {
  micMuted: boolean;
  soundMuted: boolean;
  webcamEnabled: boolean;
  sharingScreen: boolean;
};

export type TVoiceUser = {
  userId: number;
  state: TVoiceUserState;
};

export type TChannelState = {
  users: TVoiceUser[];
  activeSince: number | null;
};

export type TTransportParams = {
  id: string;
  iceParameters: IceParameters;
  iceCandidates: IceCandidate[];
  dtlsParameters: DtlsParameters;
};

export type TPublicVoiceChannelState = {
  users: {
    [userId: number]: TVoiceUserState;
  };
  activeSince: number | null;
};

export type TVoiceMap = {
  [channelId: number]: TPublicVoiceChannelState;
};

export type TStreamQualityLayer = {
  spatialLayer: number;
  label: string;
};

export type TStreamQuality =
  | { mode: 'auto' }
  | { mode: 'layer'; spatialLayer: number };

export type TConsumerType = 'simple' | 'simulcast' | 'svc' | 'pipe';

// Hover previews of a camera / screen share for users outside the call:
// the streamer uploads a downscaled JPEG still on this cadence.
export const STREAM_PREVIEW_INTERVAL_MS = 10_000;
// the server ignores uploads closer together than this
export const STREAM_PREVIEW_MIN_INTERVAL_MS = 3_000;
export const STREAM_PREVIEW_MAX_WIDTH = 480;
// base64 data URL length (~150 KB of JPEG)
export const STREAM_PREVIEW_MAX_LENGTH = 200_000;
