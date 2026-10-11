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
  { mode: 'auto' } | { mode: 'layer'; spatialLayer: number };

export type TConsumerType = 'simple' | 'simulcast' | 'svc' | 'pipe';
