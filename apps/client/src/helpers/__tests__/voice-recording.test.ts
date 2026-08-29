import { audioExtensions } from '@caesar/shared';
import { describe, expect, test } from 'vitest';
import {
    formatRecordingTime,
    pickRecordingFormat,
    recordingFormats
} from '../voice-recording';

describe('voice recording formats', () => {
    // the extension is what the server maps to a Content-Type and what the
    // message renderer maps to an <audio> player. a container whose
    // extension is not an audio one renders as a file card or a video box.
    test('every recording extension is an audio extension', () => {
        for (const format of recordingFormats) {
            expect(audioExtensions).toContain(format.extension);
        }
    });

    test('picks the first supported container', () => {
        const picked = pickRecordingFormat(
            (mimeType) => mimeType === 'audio/mp4'
        );

        expect(picked?.extension).toBe('.m4a');
    });

    test('prefers webm/opus when several are supported', () => {
        expect(pickRecordingFormat(() => true)?.extension).toBe('.weba');
    });

    test('returns undefined when nothing is supported', () => {
        expect(pickRecordingFormat(() => false)).toBeUndefined();
    });
});

describe('formatRecordingTime', () => {
    test('renders m:ss and pads the seconds', () => {
        expect(formatRecordingTime(0)).toBe('0:00');
        expect(formatRecordingTime(7_400)).toBe('0:07');
        expect(formatRecordingTime(65_000)).toBe('1:05');
        expect(formatRecordingTime(600_000)).toBe('10:00');
    });
});
