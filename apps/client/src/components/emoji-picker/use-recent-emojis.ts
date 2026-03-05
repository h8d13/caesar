import type { TEmojiItem } from '@/components/tiptap-input/helpers';
import { useCustomEmojis } from '@/features/server/emojis/hooks';
import {
    getLocalStorageItemAsJSON,
    LocalStorageKey,
    setLocalStorageItemAsJSON
} from '@/helpers/storage';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

const MAX_RECENT_EMOJIS = 32;

type StoredEmoji = {
    name: string;
    shortcodes: string[];
    fallbackImage?: string;
    emoji?: string;
};

let recentEmojisCache: TEmojiItem[] | null = null;

const subscribers = new Set<() => void>();

const notifySubscribers = () => {
    subscribers.forEach((callback) => callback());
};

const loadRecentEmojis = (): TEmojiItem[] => {
    if (recentEmojisCache !== null) {
        return recentEmojisCache;
    }

    const stored = getLocalStorageItemAsJSON<StoredEmoji[]>(
        LocalStorageKey.RECENT_EMOJIS,
        []
    );

    recentEmojisCache = stored ?? [];

    return recentEmojisCache;
};

const saveRecentEmojis = (emojis: TEmojiItem[]): void => {
    const toStore: StoredEmoji[] = emojis.map((e) => ({
        name: e.name,
        shortcodes: e.shortcodes,
        fallbackImage: e.fallbackImage,
        emoji: e.emoji
    }));

    setLocalStorageItemAsJSON(LocalStorageKey.RECENT_EMOJIS, toStore);

    recentEmojisCache = emojis;

    notifySubscribers();
};

const addRecentEmoji = (emoji: TEmojiItem): void => {
    const current = loadRecentEmojis();

    const filtered = current.filter((e) => e.name !== emoji.name);
    const updated = [emoji, ...filtered].slice(0, MAX_RECENT_EMOJIS);

    saveRecentEmojis(updated);
};

const subscribe = (callback: () => void): (() => void) => {
    subscribers.add(callback);

    return () => subscribers.delete(callback);
};

const getSnapshot = (): TEmojiItem[] => {
    return loadRecentEmojis();
};

const isCustomEmoji = (emoji: TEmojiItem): boolean =>
    !!emoji.fallbackImage && !emoji.emoji;

const useRecentEmojis = () => {
    const storedRecents = useSyncExternalStore(
        subscribe,
        getSnapshot,
        getSnapshot
    );
    const customEmojis = useCustomEmojis();

    const recentEmojis = useMemo(() => {
        const customMap = new Map(customEmojis.map((e) => [e.name, e]));

        return storedRecents
            .filter(
                (emoji) => !isCustomEmoji(emoji) || customMap.has(emoji.name)
            )
            .map((emoji) => {
                if (!isCustomEmoji(emoji)) return emoji;
                const fresh = customMap.get(emoji.name);
                if (!fresh) return emoji;
                return { ...emoji, fallbackImage: fresh.fallbackImage };
            });
    }, [storedRecents, customEmojis]);

    const addRecent = useCallback((emoji: TEmojiItem) => {
        addRecentEmoji(emoji);
    }, []);

    return {
        recentEmojis,
        addRecent
    };
};

export { addRecentEmoji, useRecentEmojis };
