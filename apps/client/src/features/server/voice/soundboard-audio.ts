const SOUNDBOARD_PLAY_EVENT = 'soundboard-play';

type SoundboardPlayDetail = { url: string };

export const emitSoundboardPlay = (url: string) => {
    window.dispatchEvent(
        new CustomEvent<SoundboardPlayDetail>(SOUNDBOARD_PLAY_EVENT, {
            detail: { url }
        })
    );
};

export const onSoundboardPlay = (
    callback: (url: string) => void
): (() => void) => {
    const handler = (e: Event) => {
        callback((e as CustomEvent<SoundboardPlayDetail>).detail.url);
    };
    window.addEventListener(SOUNDBOARD_PLAY_EVENT, handler);
    return () => window.removeEventListener(SOUNDBOARD_PLAY_EVENT, handler);
};
