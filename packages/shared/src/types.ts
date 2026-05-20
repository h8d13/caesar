import { ChannelPermission, type TFile, type TSettings, type TUser } from '.';

export enum ChannelType {
  TEXT = 'TEXT',
  VOICE = 'VOICE'
}

export enum StreamKind {
  AUDIO = 'audio',
  VIDEO = 'video',
  SCREEN = 'screen',
  SCREEN_AUDIO = 'screen_audio',
  EXTERNAL_VIDEO = 'external_video',
  EXTERNAL_AUDIO = 'external_audio'
}

export type TExternalStreamTrackKind = 'audio' | 'video';

export type TExternalStreamTracks = {
  audio?: boolean;
  video?: boolean;
};

export type TRemoteProducerIds = {
  remoteVideoIds: number[];
  remoteAudioIds: number[];
  remoteScreenIds: number[];
  remoteScreenAudioIds: number[];
  remoteExternalStreamIds: number[];
};

export type TPublicServerSettings = Pick<
  TSettings,
  | 'name'
  | 'description'
  | 'serverId'
  | 'storageUploadEnabled'
  | 'directMessagesEnabled'
  | 'gamesEnabled'
  | 'storageQuota'
  | 'storageUploadMaxFileSize'
  | 'storageFileSharingInDirectMessages'
  | 'storageMaxAvatarSize'
  | 'storageMaxBannerSize'
  | 'storageMaxFilesPerMessage'
  | 'storageSpaceQuotaByUser'
  | 'storageOverflowAction'
> & {
  webRtcMaxBitrate: number;
};

export type TGenericObject = Record<string, unknown>;

export type TMessageMetadata = {
  url: string;
  title?: string;
  siteName?: string;
  description?: string;
  mediaType: string;
  images?: string[];
  videos?: string[];
  favicons?: string[];
};

export type WithOptional<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

export enum UserStatus {
  ONLINE = 'online',
  IDLE = 'idle',
  OFFLINE = 'offline'
}

export type TOwnUser = WithOptional<TUser, 'identity'>;

export type TConnectionParams = {
  token: string;
};

export type TTempFile = {
  id: string;
  originalName: string;
  size: number;
  md5: string;
  path: string;
  extension: string;
  userId: number;
};

export type TServerInfo = Pick<
  TSettings,
  'serverId' | 'name' | 'description'
> & {
  logo: TFile | null;
  version: string;
};

export type TChannelPermissionsMap = Record<ChannelPermission, boolean>;

export type TChannelUserPermissionsMap = Record<
  number,
  { channelId: number; permissions: TChannelPermissionsMap }
>;

export type TReadStateMap = Record<number, number>;

export type TDirectMessageConversation = {
  channelId: number;
  userId: number;
  unreadCount: number;
  lastMessageAt: number;
  ephemeralMs: number | null;
};
