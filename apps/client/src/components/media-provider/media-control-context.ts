import { createContext } from 'react';

// persisted volume keys: "user-<id>", "userscreen-<id>", "soundboard"
type TVolumeKey = string;

type TVolumeSettings = Record<TVolumeKey, number>;

type TMediaControlContext = {
    volumes: TVolumeSettings;
    getVolume: (key: TVolumeKey) => number;
    setVolume: (key: TVolumeKey, volume: number) => void;
    toggleMute: (key: TVolumeKey) => void;
    getUserVolumeKey: (userId: number) => TVolumeKey;
    getUserScreenVolumeKey: (userId: number) => TVolumeKey;
    isStreamHidden: (key: string) => boolean;
    toggleStreamVisibility: (key: string) => void;
    getUserVideoKey: (userId: number) => string;
    getUserScreenVideoKey: (userId: number) => string;
};

const MediaControlContext = createContext<TMediaControlContext | null>(null);

export { MediaControlContext };
export type { TMediaControlContext, TVolumeKey, TVolumeSettings };
