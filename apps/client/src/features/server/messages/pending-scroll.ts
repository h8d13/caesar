import { useSyncExternalStore } from 'react';

// A pending-scroll target lives outside React state so the search dialog
// can set it before the destination channel-view mounts. It is reactive
// via useSyncExternalStore so an effect in the channel-view fires whenever
// a new target is set, even when the channel is already mounted (same
// channel as the search result).
let pendingScrollTarget: number | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

const getSnapshot = () => pendingScrollTarget;

const notify = () => {
    for (const listener of listeners) listener();
};

export const setPendingScrollTarget = (messageId: number) => {
    pendingScrollTarget = messageId;
    notify();
};

export const consumePendingScrollTarget = (): number | null => {
    const target = pendingScrollTarget;

    if (target === null) return null;

    pendingScrollTarget = null;
    notify();

    return target;
};

export const usePendingScrollTarget = () =>
    useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
