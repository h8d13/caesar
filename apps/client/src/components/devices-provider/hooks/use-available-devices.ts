import { useCallback, useEffect, useState } from 'react';

const useAvailableDevices = () => {
    const [inputDevices, setInputDevices] = useState<
        (MediaDeviceInfo | undefined)[]
    >([]);
    const [playbackDevices, setPlaybackDevices] = useState<
        (MediaDeviceInfo | undefined)[]
    >([]);
    const [videoDevices, setVideoDevices] = useState<
        (MediaDeviceInfo | undefined)[]
    >([]);
    const [loading, setLoading] = useState(true);

    const normalizeDevices = useCallback(
        (devices: MediaDeviceInfo[], kind: MediaDeviceKind) => {
            const seen = new Set<string>();
            const normalized: MediaDeviceInfo[] = [];

            for (const device of devices) {
                const dedupeKey =
                    device.deviceId ||
                    `${kind}-fallback-${device.groupId || 'default'}`;

                if (seen.has(dedupeKey)) {
                    continue;
                }

                seen.add(dedupeKey);
                normalized.push(device);
            }

            return normalized;
        },
        []
    );

    const loadDevices = useCallback(async () => {
        if (!navigator.mediaDevices?.enumerateDevices) {
            setLoading(false);
            return;
        }

        // promise .finally, not try/finally: the React Compiler skips the
        // latter. Errors still reach the caller.
        await navigator.mediaDevices
            .enumerateDevices()
            .then((devices) => {
                setInputDevices(
                    normalizeDevices(
                        devices.filter((d) => d.kind === 'audioinput'),
                        'audioinput'
                    )
                );
                setPlaybackDevices(
                    normalizeDevices(
                        devices.filter((d) => d.kind === 'audiooutput'),
                        'audiooutput'
                    )
                );
                setVideoDevices(
                    normalizeDevices(
                        devices.filter((d) => d.kind === 'videoinput'),
                        'videoinput'
                    )
                );
            })
            .finally(() => setLoading(false));
    }, [normalizeDevices]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs React state with the browser mediaDevices list (external system)
        void loadDevices();

        if (!navigator.mediaDevices?.addEventListener) return;

        const onDeviceChange = () => {
            void loadDevices();
        };

        navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);

        return () => {
            navigator.mediaDevices.removeEventListener(
                'devicechange',
                onDeviceChange
            );
        };
    }, [loadDevices]);

    return {
        inputDevices,
        playbackDevices,
        videoDevices,
        loading,
        loadDevices
    };
};

export { useAvailableDevices };
