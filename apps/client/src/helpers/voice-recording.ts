type TRecordingFormat = {
    mimeType: string;
    extension: string;
};

// MediaRecorder containers, most preferred first. the extension decides
// everything downstream: the server derives the served Content-Type from
// it (mime.lookup) and the renderer picks its player from the matching
// FileCategory, so each one has to stay inside audioExtensions.
const recordingFormats: TRecordingFormat[] = [
    { mimeType: 'audio/webm;codecs=opus', extension: '.weba' },
    { mimeType: 'audio/ogg;codecs=opus', extension: '.ogg' },
    { mimeType: 'audio/mp4', extension: '.m4a' }
];

const pickRecordingFormat = (
    isTypeSupported: (mimeType: string) => boolean
): TRecordingFormat | undefined =>
    recordingFormats.find((format) => isTypeSupported(format.mimeType));

const isVoiceRecordingSupported = (): boolean =>
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    !!pickRecordingFormat((mimeType) =>
        MediaRecorder.isTypeSupported(mimeType)
    );

const formatRecordingTime = (elapsedMs: number): string => {
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const seconds = totalSeconds % 60;

    return `${Math.floor(totalSeconds / 60)}:${seconds
        .toString()
        .padStart(2, '0')}`;
};

export {
    formatRecordingTime,
    isVoiceRecordingSupported,
    pickRecordingFormat,
    recordingFormats
};
