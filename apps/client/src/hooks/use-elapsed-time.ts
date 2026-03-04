import { useEffect, useMemo, useState } from 'react';

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
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!startTime) return;

        const interval = setInterval(() => {
            setNow(Date.now());
        }, 1000);

        return () => clearInterval(interval);
    }, [startTime]);

    return useMemo(() => {
        if (!startTime) return '0:00';
        return formatElapsed(Math.max(0, now - startTime));
    }, [now, startTime]);
};
