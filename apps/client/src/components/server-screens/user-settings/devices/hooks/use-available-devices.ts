import { useAvailableDevices as useDeviceStore } from '@/components/devices-provider/hooks/use-available-devices';

// default device always on top, then sorted alphabetically
const sortDevices = (devices: MediaDeviceInfo[]) =>
    [...devices].sort((a, b) => {
        if (a.deviceId === 'default') return -1;
        if (b.deviceId === 'default') return 1;

        return a.label.localeCompare(b.label);
    });

const useAvailableDevices = () => {
    const {
        inputDevices,
        playbackDevices,
        videoDevices,
        loading,
        loadDevices
    } = useDeviceStore();

    return {
        inputDevices: sortDevices(inputDevices),
        playbackDevices: sortDevices(playbackDevices),
        videoDevices: sortDevices(videoDevices),
        loading,
        loadDevices
    };
};

export { useAvailableDevices };
