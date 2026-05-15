import { MICROPHONE_GATE_DEFAULT_THRESHOLD_DB } from '@/helpers/audio-gate';
import {
    getLocalStorageItemAsJSON,
    LocalStorageKey,
    setLocalStorageItemAsJSON
} from '@/helpers/storage';
import { Resolution, VideoCodec, type TDeviceSettings } from '@/types';
import { DEFAULT_BITRATE } from '@sharkord/shared';
import {
    createContext,
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import { useAvailableDevices } from './hooks/use-available-devices';

const DEFAULT_DEVICE_SETTINGS: TDeviceSettings = {
    microphoneId: undefined,
    playbackId: undefined,
    webcamId: undefined,
    webcamResolution: Resolution['720p'],
    webcamFramerate: 30,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    noiseGateEnabled: true,
    noiseGateThresholdDb: MICROPHONE_GATE_DEFAULT_THRESHOLD_DB,
    rnnoiseEnabled: true,
    dtlnEnabled: false,
    shareSystemAudio: true,
    mirrorOwnVideo: false,
    screenResolution: Resolution['720p'],
    screenFramerate: 30,
    screenCodec: VideoCodec.AUTO,
    screenBitrate: DEFAULT_BITRATE
};

export type TDevicesProvider = {
    loading: boolean;
    devices: TDeviceSettings;
    saveDevices: (newDevices: TDeviceSettings) => void;
};

const DevicesProviderContext = createContext<TDevicesProvider>({
    loading: false,
    devices: DEFAULT_DEVICE_SETTINGS,
    saveDevices: () => {}
});

type TDevicesProviderProps = {
    children: React.ReactNode;
};

const DevicesProvider = memo(({ children }: TDevicesProviderProps) => {
    const [loading, setLoading] = useState<boolean>(true);
    const [devices, setDevices] = useState<TDeviceSettings>(
        DEFAULT_DEVICE_SETTINGS
    );
    const initializedRef = useRef(false);
    const {
        loading: devicesLoading,
        inputDevices,
        playbackDevices,
        videoDevices
    } = useAvailableDevices();

    const saveDevices = useCallback((newDevices: TDeviceSettings) => {
        setDevices(newDevices);
        setLocalStorageItemAsJSON<TDeviceSettings>(
            LocalStorageKey.DEVICES_SETTINGS,
            newDevices
        );
    }, []);

    useEffect(() => {
        if (devicesLoading || initializedRef.current) return;

        initializedRef.current = true;

        const savedSettings = getLocalStorageItemAsJSON<TDeviceSettings>(
            LocalStorageKey.DEVICES_SETTINGS
        );

        const autoMicrophoneId =
            inputDevices.find((d) => d?.deviceId === 'default')?.deviceId ??
            inputDevices[0]?.deviceId;

        const autoPlaybackId =
            playbackDevices.find((d) => d?.deviceId === 'default')?.deviceId ??
            playbackDevices[0]?.deviceId;

        const autoWebcamId =
            videoDevices.find((d) => d?.deviceId === 'default')?.deviceId ??
            videoDevices[0]?.deviceId;

        if (savedSettings) {
            setDevices({
                ...DEFAULT_DEVICE_SETTINGS,
                ...savedSettings,
                microphoneId: savedSettings.microphoneId ?? autoMicrophoneId,
                playbackId: savedSettings.playbackId ?? autoPlaybackId,
                webcamId: savedSettings.webcamId ?? autoWebcamId
            });
        } else {
            setDevices({
                ...DEFAULT_DEVICE_SETTINGS,
                microphoneId: autoMicrophoneId,
                playbackId: autoPlaybackId,
                webcamId: autoWebcamId
            });
        }

        setLoading(false);
    }, [devicesLoading, inputDevices, playbackDevices, videoDevices]);

    const contextValue = useMemo<TDevicesProvider>(
        () => ({
            loading,
            devices,
            saveDevices
        }),
        [loading, devices, saveDevices]
    );

    return (
        <DevicesProviderContext.Provider value={contextValue}>
            {children}
        </DevicesProviderContext.Provider>
    );
});

export { DevicesProvider, DevicesProviderContext };
