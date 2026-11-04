import {
    getLocalStorageItemAsJSON,
    LocalStorageKey,
    setLocalStorageItemAsJSON
} from './storage';

type NicknameMap = Record<number, string>;

// render-time readers subscribe (useNickname): a plain getNickname call
// is memoized by the React Compiler and never sees a later write
const listeners = new Set<() => void>();

const subscribeNicknames = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

const writeNicknameMap = (map: NicknameMap) => {
    setLocalStorageItemAsJSON(LocalStorageKey.NICKNAMES, map);
    for (const listener of listeners) listener();
};

const getNicknameMap = (): NicknameMap => {
    return getLocalStorageItemAsJSON<NicknameMap>(
        LocalStorageKey.NICKNAMES,
        {}
    )!;
};

const getNickname = (userId: number): string | null => {
    const map = getNicknameMap();
    return map[userId] ?? null;
};

const setNickname = (userId: number, nickname: string): void => {
    const map = getNicknameMap();
    map[userId] = nickname;
    writeNicknameMap(map);
};

const removeNickname = (userId: number): void => {
    const map = getNicknameMap();
    delete map[userId];
    writeNicknameMap(map);
};

export { getNickname, removeNickname, setNickname, subscribeNicknames };
