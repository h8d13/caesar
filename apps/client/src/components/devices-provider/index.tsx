import {
    getLocalStorageItemAsJSON,
    LocalStorageKey,
    setLocalStorageItemAsJSON
} from '@/helpers/storage';
import { NoiseSuppressionMode, type TDeviceSettings } from '@/types';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    DEFAULT_DEVICE_SETTINGS,
    DevicesProviderContext,
    type TDevicesProvider
} from './context';
import { useAvailableDevices } from './hooks/use-available-devices';

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

        const savedSettings = getLocalStorageItemAsJSON<
            TDeviceSettings & {
                rnnoiseEnabled?: boolean;
                dtlnEnabled?: boolean;
            }
        >(LocalStorageKey.DEVICES_SETTINGS);

        // migrate legacy boolean flags to the enum mode. dtln wins if both
        // were on. explicit rnnoiseEnabled=false => NONE.
        const migratedMode: NoiseSuppressionMode =
            savedSettings?.noiseSuppressionMode ??
            (savedSettings?.dtlnEnabled
                ? NoiseSuppressionMode.DTLN
                : savedSettings?.rnnoiseEnabled === false
                  ? NoiseSuppressionMode.NONE
                  : NoiseSuppressionMode.RNNOISE);

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
            const { rnnoiseEnabled, dtlnEnabled, ...rest } = savedSettings;
            void rnnoiseEnabled;
            void dtlnEnabled;

            setDevices({
                ...DEFAULT_DEVICE_SETTINGS,
                ...rest,
                noiseSuppressionMode: migratedMode,
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

export { DevicesProvider };
