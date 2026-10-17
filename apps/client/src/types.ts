import type { StreamKind } from '@caesar/shared';

export type TDevices = {
    input: {
        deviceId: string | undefined;
        autoGainControl: boolean;
        echoCancellation: boolean;
        noiseSuppression: boolean;
    };
    playback: {
        deviceId: string | undefined;
    };
    webcam: {
        deviceId: string | undefined;
        resolution: Resolution;
        framerate: number;
    };
    screen: {
        resolution: Resolution;
        framerate: number;
        audio: boolean;
    };
};

export enum Resolution {
    '2160p' = '2160p',
    '1440p' = '1440p',
    '1080p' = '1080p',
    '720p' = '720p',
    '480p' = '480p',
    '360p' = '360p',
    '240p' = '240p',
    '144p' = '144p'
}

export enum VideoCodec {
    AUTO = 'auto',
    VP8 = 'video/VP8',
    VP9 = 'video/VP9',
    H264 = 'video/H264',
    AV1 = 'video/AV1'
}

export enum NoiseSuppressionMode {
    NONE = 'none',
    RNNOISE = 'rnnoise',
    DTLN = 'dtln'
}

export type TDeviceSettings = {
    microphoneId: string | undefined;
    playbackId: string | undefined;
    webcamId: string | undefined;
    webcamResolution: Resolution;
    webcamFramerate: number;
    webcamBitrate: number;
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
    noiseGateEnabled: boolean;
    noiseGateThresholdDb: number;
    noiseSuppressionMode: NoiseSuppressionMode;
    shareSystemAudio: boolean;
    mirrorOwnVideo: boolean;
    simulcastEnabled: boolean;
    screenResolution: Resolution;
    screenFramerate: number;
    screenCodec: VideoCodec;
    screenBitrate: number;
};

export type TRemoteUserStreamKinds =
    | StreamKind.AUDIO
    | StreamKind.VIDEO
    | StreamKind.SCREEN
    | StreamKind.SCREEN_AUDIO;

export type TRemoteStreams = {
    [userId: number]: {
        [StreamKind.AUDIO]: MediaStream | undefined;
        [StreamKind.VIDEO]: MediaStream | undefined;
        [StreamKind.SCREEN]: MediaStream | undefined;
        [StreamKind.SCREEN_AUDIO]: MediaStream | undefined;
    };
};
