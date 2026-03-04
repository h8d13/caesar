// Shared ref for the active soundboard audio element.
// Accessed by subscriptions.ts (writes) and SoundboardVolumeSync (reads volume reactively).
export const soundboardAudioRef: { current: HTMLAudioElement | null } = {
    current: null
};
