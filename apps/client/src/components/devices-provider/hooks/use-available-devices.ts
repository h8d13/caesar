import { useSyncExternalStore } from 'react';

type TDevicesSnapshot = {
    inputDevices: MediaDeviceInfo[];
    playbackDevices: MediaDeviceInfo[];
    videoDevices: MediaDeviceInfo[];
    loading: boolean;
};

// navigator.mediaDevices is one external store for every caller: the
// snapshot only changes when a load lands, keeping getSnapshot stable.
let snapshot: TDevicesSnapshot = {
    inputDevices: [],
    playbackDevices: [],
    videoDevices: [],
    loading: true
};
const listeners = new Set<() => void>();

const setSnapshot = (next: Partial<TDevicesSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
};

const normalizeDevices = (
    devices: MediaDeviceInfo[],
    kind: MediaDeviceKind
) => {
    const seen = new Set<string>();
    const normalized: MediaDeviceInfo[] = [];

    for (const device of devices.filter((d) => d.kind === kind)) {
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
};

const loadDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
        setSnapshot({ loading: false });
        return;
    }

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();

        setSnapshot({
            inputDevices: normalizeDevices(devices, 'audioinput'),
            playbackDevices: normalizeDevices(devices, 'audiooutput'),
            videoDevices: normalizeDevices(devices, 'videoinput'),
            loading: false
        });
    } finally {
        if (snapshot.loading) setSnapshot({ loading: false });
    }
};

const onDeviceChange = () => {
    void loadDevices();
};

// every new subscriber triggers a fresh enumeration, as each mount did
// when the hook kept its own state
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    void loadDevices();

    if (listeners.size === 1) {
        navigator.mediaDevices?.addEventListener?.(
            'devicechange',
            onDeviceChange
        );
    }

    return () => {
        listeners.delete(listener);

        if (listeners.size === 0) {
            navigator.mediaDevices?.removeEventListener?.(
                'devicechange',
                onDeviceChange
            );
        }
    };
};

const getSnapshot = () => snapshot;

const useAvailableDevices = () => {
    const devices = useSyncExternalStore(subscribe, getSnapshot);

    return { ...devices, loadDevices };
};

export { useAvailableDevices };
