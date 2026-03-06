import { onSoundboardPlay } from '@/features/server/voice/soundboard-audio';
import {
    getLocalStorageItemAsJSON,
    LocalStorageKey,
    setLocalStorageItemAsJSON
} from '@/helpers/storage';
import {
    createContext,
    memo,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState
} from 'react';

// volume keys are string-based for persistence
// user volumes: "user-{userId}"
// external stream volumes: "external-{sourceId}-{key}"
type TVolumeKey = string;

type TVolumeSettings = Record<TVolumeKey, number>;

type TMediaControlContext = {
    volumes: TVolumeSettings;
    getVolume: (key: TVolumeKey) => number;
    setVolume: (key: TVolumeKey, volume: number) => void;
    toggleMute: (key: TVolumeKey) => void;
    getUserVolumeKey: (userId: number) => TVolumeKey;
    getUserScreenVolumeKey: (userId: number) => TVolumeKey;
    getExternalVolumeKey: (sourceId: string, key: string) => TVolumeKey;
    isStreamHidden: (key: string) => boolean;
    toggleStreamVisibility: (key: string) => void;
    getUserVideoKey: (userId: number) => string;
    getUserScreenVideoKey: (userId: number) => string;
};

const MediaControlContext = createContext<TMediaControlContext | null>(null);

type TMediaControlProviderProps = {
    children: React.ReactNode;
};

const loadVolumesFromStorage = (): TVolumeSettings => {
    try {
        return (
            getLocalStorageItemAsJSON<TVolumeSettings>(
                LocalStorageKey.VOLUME_SETTINGS
            ) ?? {}
        );
    } catch {
        return {};
    }
};

const saveVolumesToStorage = (volumes: TVolumeSettings) => {
    try {
        setLocalStorageItemAsJSON(LocalStorageKey.VOLUME_SETTINGS, volumes);
    } catch {
        // ignore
    }
};

const loadHiddenStreamsFromStorage = (): Set<string> => {
    try {
        const arr =
            getLocalStorageItemAsJSON<string[]>(
                LocalStorageKey.HIDDEN_STREAMS
            ) ?? [];
        return new Set(arr);
    } catch {
        return new Set();
    }
};

const saveHiddenStreamsToStorage = (hidden: Set<string>) => {
    try {
        setLocalStorageItemAsJSON(LocalStorageKey.HIDDEN_STREAMS, [...hidden]);
    } catch {
        // ignore
    }
};

// Manages soundboard audio playback inside React so volume control
// works the same way as voice/screen/external streams in use-media-refs.
const SoundboardPlayer = memo(() => {
    const { getVolume } = useMediaControl();
    const volume = getVolume('soundboard');
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Listen for soundboard play events from the subscription
    useEffect(() => {
        return onSoundboardPlay((url) => {
            // Stop previous sound (limit to one at a time)
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }

            const audio = new Audio(url);
            audio.volume = volume / 100;
            audioRef.current = audio;

            audio.addEventListener('ended', () => {
                if (audioRef.current === audio) audioRef.current = null;
            });
            audio.addEventListener('error', () => {
                if (audioRef.current === audio) audioRef.current = null;
            });

            audio.play().catch(() => {
                if (audioRef.current === audio) audioRef.current = null;
            });
        });
    });

    // Update volume on the active audio element reactively,
    // same pattern as use-media-refs: audioRef.current.volume = userVolume / 100
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume / 100;
        }
    }, [volume]);

    // Stop playback on unmount
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    return null;
});

const MediaControlProvider = memo(
    ({ children }: TMediaControlProviderProps) => {
        const [volumes, setVolumes] = useState<TVolumeSettings>(
            loadVolumesFromStorage
        );
        const [hiddenStreams, setHiddenStreams] = useState<Set<string>>(
            loadHiddenStreamsFromStorage
        );

        const previousVolumesRef = useRef<TVolumeSettings>({});

        const getVolume = useCallback(
            (key: TVolumeKey): number => {
                return volumes[key] ?? 100;
            },
            [volumes]
        );

        const setVolume = useCallback((key: TVolumeKey, volume: number) => {
            setVolumes((prev) => {
                const next = { ...prev, [key]: volume };
                saveVolumesToStorage(next);
                return next;
            });

            if (volume > 0) {
                previousVolumesRef.current[key] = volume;
            }
        }, []);

        const toggleMute = useCallback((key: TVolumeKey) => {
            setVolumes((prev) => {
                const currentVolume = prev[key] ?? 100;
                const isMuted = currentVolume === 0;
                const newVolume = isMuted
                    ? (previousVolumesRef.current[key] ?? 100)
                    : 0;

                if (!isMuted) {
                    previousVolumesRef.current[key] = currentVolume;
                }

                const next = { ...prev, [key]: newVolume };
                saveVolumesToStorage(next);
                return next;
            });
        }, []);

        const getUserVolumeKey = useCallback((userId: number): TVolumeKey => {
            return `user-${userId}`;
        }, []);

        const getUserScreenVolumeKey = useCallback(
            (userId: number): TVolumeKey => {
                return `userscreen-${userId}`;
            },
            []
        );

        const getExternalVolumeKey = useCallback(
            (sourceId: string, key: string): TVolumeKey => {
                return `external-${sourceId}-${key}`;
            },
            []
        );

        const isStreamHidden = useCallback(
            (key: string): boolean => {
                return hiddenStreams.has(key);
            },
            [hiddenStreams]
        );

        const toggleStreamVisibility = useCallback((key: string) => {
            setHiddenStreams((prev) => {
                const next = new Set(prev);
                if (next.has(key)) {
                    next.delete(key);
                } else {
                    next.add(key);
                }
                saveHiddenStreamsToStorage(next);
                return next;
            });
        }, []);

        const getUserVideoKey = useCallback((userId: number): string => {
            return `uservideo-${userId}`;
        }, []);

        const getUserScreenVideoKey = useCallback((userId: number): string => {
            return `userscreenvideo-${userId}`;
        }, []);

        return (
            <MediaControlContext.Provider
                value={{
                    volumes,
                    getVolume,
                    setVolume,
                    toggleMute,
                    getUserVolumeKey,
                    getUserScreenVolumeKey,
                    getExternalVolumeKey,
                    isStreamHidden,
                    toggleStreamVisibility,
                    getUserVideoKey,
                    getUserScreenVideoKey
                }}
            >
                <SoundboardPlayer />
                {children}
            </MediaControlContext.Provider>
        );
    }
);

const useMediaControl = () => {
    const context = useContext(MediaControlContext);

    if (!context) {
        throw new Error(
            'useMediaControl must be used within MediaControlProvider'
        );
    }

    return context;
};

// eslint-disable-next-line react-refresh/only-export-components
export { MediaControlContext, MediaControlProvider, useMediaControl };
export type { TMediaControlContext, TVolumeKey };
