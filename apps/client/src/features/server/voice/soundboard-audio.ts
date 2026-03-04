let activeSoundboardAudio: HTMLAudioElement | null = null;

export const getActiveSoundboardAudio = () => activeSoundboardAudio;

export const setActiveSoundboardAudio = (audio: HTMLAudioElement | null) => {
    activeSoundboardAudio = audio;
};

export const updateSoundboardVolume = (volume: number) => {
    if (activeSoundboardAudio) {
        activeSoundboardAudio.volume = volume / 100;
    }
};
