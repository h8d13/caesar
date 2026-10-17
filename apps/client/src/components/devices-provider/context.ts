import { MICROPHONE_GATE_DEFAULT_THRESHOLD_DB } from '@/helpers/audio-gate';
import {
    NoiseSuppressionMode,
    Resolution,
    VideoCodec,
    type TDeviceSettings
} from '@/types';
import { DEFAULT_BITRATE, DEFAULT_WEBCAM_BITRATE } from '@caesar/shared';
import { createContext } from 'react';

const DEFAULT_DEVICE_SETTINGS: TDeviceSettings = {
    microphoneId: undefined,
    playbackId: undefined,
    webcamId: undefined,
    webcamResolution: Resolution['720p'],
    webcamFramerate: 30,
    webcamBitrate: DEFAULT_WEBCAM_BITRATE,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    noiseGateEnabled: true,
    noiseGateThresholdDb: MICROPHONE_GATE_DEFAULT_THRESHOLD_DB,
    noiseSuppressionMode: NoiseSuppressionMode.RNNOISE,
    shareSystemAudio: true,
    mirrorOwnVideo: false,
    simulcastEnabled: true,
    screenResolution: Resolution['720p'],
    screenFramerate: 30,
    screenCodec: VideoCodec.AUTO,
    screenBitrate: DEFAULT_BITRATE
};

type TDevicesProvider = {
    loading: boolean;
    devices: TDeviceSettings;
    saveDevices: (newDevices: TDeviceSettings) => void;
};

const DevicesProviderContext = createContext<TDevicesProvider>({
    loading: false,
    devices: DEFAULT_DEVICE_SETTINGS,
    saveDevices: () => {}
});

export { DEFAULT_DEVICE_SETTINGS, DevicesProviderContext };
export type { TDevicesProvider };
