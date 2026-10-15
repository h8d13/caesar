import { useEffect, useState } from 'react';

// Wall clock as state, advanced every intervalMs while enabled: render
// derives from it instead of calling Date.now(), which is impure there.
export const useNow = (intervalMs: number, enabled = true) => {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!enabled) return;

        const interval = setInterval(() => setNow(Date.now()), intervalMs);

        return () => clearInterval(interval);
    }, [intervalMs, enabled]);

    return now;
};
