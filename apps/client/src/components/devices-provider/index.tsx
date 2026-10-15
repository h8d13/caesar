import {
    getLocalStorageItemAsJSON,
    LocalStorageKey,
    setLocalStorageItemAsJSON
} from '@/helpers/storage';
import { NoiseSuppressionMode, type TDeviceSettings } from '@/types';
import { memo, useCallback, useMemo, useState } from 'react';
import {
    DEFAULT_DEVICE_SETTINGS,
    DevicesProviderContext,
    type TDevicesProvider
} from './context';
import { useAvailableDevices } from './hooks/use-available-devices';

type TDevicesProviderProps = {
    children: React.ReactNode;
};

type TAvailableDevices = ReturnType<typeof useAvailableDevices>;

const defaultDeviceId = (list: TAvailableDevices['inputDevices']) =>
    list.find((d) => d?.deviceId === 'default')?.deviceId ?? list[0]?.deviceId;

// Saved settings with missing device ids filled from what is plugged in.
const resolveInitialDevices = ({
    inputDevices,
    playbackDevices,
    videoDevices
}: TAvailableDevices): TDeviceSettings => {
    const savedSettings = getLocalStorageItemAsJSON<
        TDeviceSettings & {
            rnnoiseEnabled?: boolean;
            dtlnEnabled?: boolean;
        }
    >(LocalStorageKey.DEVICES_SETTINGS);

    const autoMicrophoneId = defaultDeviceId(inputDevices);
    const autoPlaybackId = defaultDeviceId(playbackDevices);
    const autoWebcamId = defaultDeviceId(videoDevices);

    if (!savedSettings) {
        return {
            ...DEFAULT_DEVICE_SETTINGS,
            microphoneId: autoMicrophoneId,
            playbackId: autoPlaybackId,
            webcamId: autoWebcamId
        };
    }

    const { rnnoiseEnabled, dtlnEnabled, ...rest } = savedSettings;

    // migrate legacy boolean flags to the enum mode. dtln wins if both
    // were on. explicit rnnoiseEnabled=false => NONE.
    const migratedMode: NoiseSuppressionMode =
        savedSettings.noiseSuppressionMode ??
        (dtlnEnabled
            ? NoiseSuppressionMode.DTLN
            : rnnoiseEnabled === false
              ? NoiseSuppressionMode.NONE
              : NoiseSuppressionMode.RNNOISE);

    return {
        ...DEFAULT_DEVICE_SETTINGS,
        ...rest,
        noiseSuppressionMode: migratedMode,
        microphoneId: savedSettings.microphoneId ?? autoMicrophoneId,
        playbackId: savedSettings.playbackId ?? autoPlaybackId,
        webcamId: savedSettings.webcamId ?? autoWebcamId
    };
};

const DevicesProvider = memo(({ children }: TDevicesProviderProps) => {
    // null until the first device enumeration; resolved once, so devices
    // plugged in later never override the user's choice
    const [resolved, setResolved] = useState<TDeviceSettings | null>(null);
    const availableDevices = useAvailableDevices();

    if (resolved === null && !availableDevices.loading) {
        setResolved(resolveInitialDevices(availableDevices));
    }

    const loading = resolved === null;
    const devices = resolved ?? DEFAULT_DEVICE_SETTINGS;

    const saveDevices = useCallback((newDevices: TDeviceSettings) => {
        setResolved(newDevices);
        setLocalStorageItemAsJSON<TDeviceSettings>(
            LocalStorageKey.DEVICES_SETTINGS,
            newDevices
        );
    }, []);

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
