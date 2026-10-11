import { useSyncExternalStore } from 'react';

// Mobile browsers freeze hidden pages; work started there (reconnects)
// stalls or fails, so callers wait for the page to come back.
const subscribe = (callback: () => void) => {
    document.addEventListener('visibilitychange', callback);
    return () => document.removeEventListener('visibilitychange', callback);
};

const useIsPageVisible = () =>
    useSyncExternalStore(subscribe, () => !document.hidden);

export { useIsPageVisible };
