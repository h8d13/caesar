import { useMemo } from 'react';
import { useNow } from './use-now';

const formatElapsed = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        : `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export const useElapsedTime = (startTime: number | null) => {
    const now = useNow(1000, Boolean(startTime));

    return useMemo(() => {
        if (!startTime) return '0:00';
        return formatElapsed(Math.max(0, now - startTime));
    }, [now, startTime]);
};
