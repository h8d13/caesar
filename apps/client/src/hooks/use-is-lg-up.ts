import { useSyncExternalStore } from 'react';

// tailwind lg (1024px): below this the members sidebar is the
// mobile overlay, so top-bar toggles need to know which one to drive.
const query = window.matchMedia('(min-width: 1024px)');

const subscribe = (callback: () => void) => {
    query.addEventListener('change', callback);
    return () => query.removeEventListener('change', callback);
};

const useIsLgUp = () => useSyncExternalStore(subscribe, () => query.matches);

export { useIsLgUp };
