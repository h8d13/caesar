import { SoundType } from '../types';

// Constructed lazily on first sound: browsers refuse to start an
// AudioContext before a user gesture, which fires the noisy
// "AudioContext was prevented from starting automatically" warning if
// we eagerly new() it at module load.
//
// Catch: if the first sound is event-driven (e.g. a WS DM_CALL_RING
// arriving on the callee while they're idle), the context is created
// without a recent gesture and starts in `suspended` state, silent.
// Callers that want guaranteed audio must call ensureAudioCtxReady()
// from a gesture-tied path (login click is the canonical one).
let _audioCtx: AudioContext | null = null;
const getAudioCtx = (): AudioContext => {
    if (!_audioCtx) {
        _audioCtx = new (
            window.AudioContext ||
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).webkitAudioContext
        )();
    }
    if (_audioCtx.state === 'suspended') {
        // best-effort resume; succeeds when called inside a gesture stack,
        // no-op when not (browser keeps it suspended).
        _audioCtx.resume().catch(() => {
            /* policy declined; will retry on next call */
        });
    }
    return _audioCtx;
};

// Call from a user-gesture path (e.g. login click handler) to make sure
// the AudioContext exists and is `running` before any event-driven sound
// (incoming call ring, etc.) tries to play. Idempotent.
export const ensureAudioCtxReady = (): void => {
    getAudioCtx();
};

// Fallback for entry paths without an explicit gesture (auto-login)
if (typeof window !== 'undefined') {
    const warm = () => {
        ensureAudioCtxReady();
        window.removeEventListener('pointerdown', warm);
        window.removeEventListener('keydown', warm);
    };
    window.addEventListener('pointerdown', warm);
    window.addEventListener('keydown', warm);
}

const SOUNDS_VOLUME = 2;

const now = () => getAudioCtx().currentTime;

const createOsc = (type: OscillatorType, freq: number) => {
    const osc = getAudioCtx().createOscillator();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now());

    return osc;
};

const createGain = (value = 1) => {
    const gain = getAudioCtx().createGain();

    gain.gain.setValueAtTime(value * SOUNDS_VOLUME, now());

    return gain;
};

// MESSAGE_RECEIVED minimal single tone
const sfxMessageReceived = () => {
    const osc = createOsc('sine', 600);
    const gain = createGain(0.05);

    gain.gain.exponentialRampToValueAtTime(0.0001, now() + 0.05);

    osc.connect(gain).connect(getAudioCtx().destination);
    osc.start();
    osc.stop(now() + 0.05);
};

// MESSAGE_SENT minimal single tone (slightly higher)
const sfxMessageSent = () => {
    const osc = createOsc('sine', 750);
    const gain = createGain(0.04);

    gain.gain.exponentialRampToValueAtTime(0.0001, now() + 0.04);

    osc.connect(gain).connect(getAudioCtx().destination);
    osc.start();
    osc.stop(now() + 0.04);
};

// OWN_USER_JOINED_VOICE_CHANNEL rich chord progression
const sfxOwnUserJoinedVoiceChannel = () => {
    // First chord (C major feel)
    const chord1 = [
        { freq: 523, gain: 0.09 }, // C
        { freq: 659, gain: 0.07 }, // E
        { freq: 784, gain: 0.06 } // G
    ];

    chord1.forEach(({ freq, gain: g }) => {
        const osc = createOsc('sine', freq);
        const gain = createGain(g);

        gain.gain.exponentialRampToValueAtTime(0.0001, now() + 0.25);

        osc.connect(gain).connect(getAudioCtx().destination);
        osc.start();
        osc.stop(now() + 0.25);
    });

    // Second chord overlapping (add brightness)
    const chord2 = [
        { freq: 1046, gain: 0.04 }, // C (octave up)
        { freq: 1318, gain: 0.03 } // E (octave up)
    ];

    chord2.forEach(({ freq, gain: g }) => {
        const osc = createOsc('triangle', freq);
        const gain = createGain(g);

        gain.gain.exponentialRampToValueAtTime(0.0001, now() + 0.3);

        osc.connect(gain).connect(getAudioCtx().destination);
        osc.start(now() + 0.08);
        osc.stop(now() + 0.3);
    });
};

// OWN_USER_LEFT_VOICE_CHANNEL soft chord fade
const sfxOwnUserLeftVoiceChannel = () => {
    // Main chord (minor feel)
    const chord1 = [
        { freq: 440, gain: 0.09 }, // A
        { freq: 523, gain: 0.07 }, // C
        { freq: 659, gain: 0.06 } // E
    ];

    chord1.forEach(({ freq, gain: g }) => {
        const osc = createOsc('sine', freq);
        const gain = createGain(g);

        gain.gain.exponentialRampToValueAtTime(0.0001, now() + 0.3);

        osc.connect(gain).connect(getAudioCtx().destination);
        osc.start();
        osc.stop(now() + 0.3);
    });

    // Subtle harmonic layer
    const osc2 = createOsc('triangle', 880);
    const gain2 = createGain(0.04);

    gain2.gain.exponentialRampToValueAtTime(0.0001, now() + 0.25);

    osc2.connect(gain2).connect(getAudioCtx().destination);
    osc2.start(now() + 0.05);
    osc2.stop(now() + 0.3);
};

// Single-tone 60ms blip used by the mute/unmute mic + sound feedback
// sounds. Frequency selects the perceived pitch (low click vs high tone).
const sfxBlip = (freq: number) => {
    const osc = createOsc('sine', freq);
    const gain = createGain(0.05);

    gain.gain.exponentialRampToValueAtTime(0.0001, now() + 0.06);

    osc.connect(gain).connect(getAudioCtx().destination);
    osc.start();
    osc.stop(now() + 0.06);
};

const sfxOwnUserMutedMic = () => sfxBlip(350); // bland low click
const sfxOwnUserUnmutedMic = () => sfxBlip(500); // bland slightly higher click
const sfxOwnUserMutedSound = () => sfxBlip(450); // bland mid-low tone
const sfxOwnUserUnmutedSound = () => sfxBlip(650); // bland mid-high tone

// STARTED_WEBCAM subtle layered activation
const sfxOwnUserStartedWebcam = () => {
    const osc1 = createOsc('sine', 700);
    const gain1 = createGain(0.07);

    gain1.gain.exponentialRampToValueAtTime(0.0001, now() + 0.12);

    osc1.connect(gain1).connect(getAudioCtx().destination);
    osc1.start();
    osc1.stop(now() + 0.12);

    const osc2 = createOsc('sine', 900);
    const gain2 = createGain(0.04);

    gain2.gain.exponentialRampToValueAtTime(0.0001, now() + 0.1);

    osc2.connect(gain2).connect(getAudioCtx().destination);
    osc2.start(now() + 0.04);
    osc2.stop(now() + 0.12);
};

// STOPPED_WEBCAM subtle layered deactivation
const sfxOwnUserStoppedWebcam = () => {
    const osc1 = createOsc('sine', 700);
    const gain1 = createGain(0.07);

    osc1.frequency.exponentialRampToValueAtTime(500, now() + 0.12);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now() + 0.14);

    osc1.connect(gain1).connect(getAudioCtx().destination);
    osc1.start();
    osc1.stop(now() + 0.14);
};

// STARTED_SCREENSHARE richer activation sequence
const sfxOwnUserStartedScreenshare = () => {
    // Main pulse sequence
    const pulses = [
        { freq: 600, delay: 0 },
        { freq: 800, delay: 0.06 },
        { freq: 1000, delay: 0.12 }
    ];

    pulses.forEach(({ freq, delay }) => {
        const t = now() + delay;
        const osc = createOsc('sine', freq);
        const gain = createGain(0.08);

        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);

        osc.connect(gain).connect(getAudioCtx().destination);
        osc.start(t);
        osc.stop(t + 0.1);
    });

    // Harmonic layer
    const osc2 = createOsc('triangle', 1200);
    const gain2 = createGain(0.03);

    gain2.gain.exponentialRampToValueAtTime(0.0001, now() + 0.2);

    osc2.connect(gain2).connect(getAudioCtx().destination);
    osc2.start(now() + 0.08);
    osc2.stop(now() + 0.22);
};

// STOPPED_SCREENSHARE richer deactivation
const sfxOwnUserStoppedScreenshare = () => {
    const osc1 = createOsc('sine', 900);
    const gain1 = createGain(0.08);

    osc1.frequency.exponentialRampToValueAtTime(550, now() + 0.18);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now() + 0.2);

    osc1.connect(gain1).connect(getAudioCtx().destination);
    osc1.start();
    osc1.stop(now() + 0.2);

    const osc2 = createOsc('triangle', 1100);
    const gain2 = createGain(0.03);

    osc2.frequency.exponentialRampToValueAtTime(700, now() + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now() + 0.2);

    osc2.connect(gain2).connect(getAudioCtx().destination);
    osc2.start(now() + 0.05);
    osc2.stop(now() + 0.2);
};

// REMOTE JOIN layered uplifting tones
const sfxRemoteUserJoinedVoiceChannel = () => {
    const tones = [
        { freq: 587, gain: 0.06, delay: 0 }, // D
        { freq: 740, gain: 0.05, delay: 0.06 }, // F#
        { freq: 880, gain: 0.04, delay: 0.12 } // A
    ];

    tones.forEach(({ freq, gain: g, delay }) => {
        const t = now() + delay;
        const osc = createOsc('sine', freq);
        const gain = createGain(g);

        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);

        osc.connect(gain).connect(getAudioCtx().destination);
        osc.start(t);
        osc.stop(t + 0.2);
    });
};

// REMOTE LEAVE layered descending tones
const sfxRemoteUserLeftVoiceChannel = () => {
    const tones = [
        { freq: 659, gain: 0.06, delay: 0 }, // E
        { freq: 523, gain: 0.05, delay: 0.06 }, // C
        { freq: 440, gain: 0.04, delay: 0.12 } // A
    ];

    tones.forEach(({ freq, gain: g, delay }) => {
        const t = now() + delay;
        const osc = createOsc('sine', freq);
        const gain = createGain(g);

        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);

        osc.connect(gain).connect(getAudioCtx().destination);
        osc.start(t);
        osc.stop(t + 0.2);
    });
};
// REMOTE STARTED SCREENSHARE similar to own user but slightly softer
const sfxRemoteUserStartedScreenshare = () => {
    const pulses = [
        { freq: 600, delay: 0 },
        { freq: 800, delay: 0.06 },
        { freq: 1000, delay: 0.12 }
    ];

    pulses.forEach(({ freq, delay }) => {
        const t = now() + delay;
        const osc = createOsc('sine', freq);
        const gain = createGain(0.06);

        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);

        osc.connect(gain).connect(getAudioCtx().destination);
        osc.start(t);
        osc.stop(t + 0.1);
    });

    const osc2 = createOsc('triangle', 1200);
    const gain2 = createGain(0.02);

    gain2.gain.exponentialRampToValueAtTime(0.0001, now() + 0.2);

    osc2.connect(gain2).connect(getAudioCtx().destination);
    osc2.start(now() + 0.08);
    osc2.stop(now() + 0.22);
};

// REMOTE STOPPED SCREENSHARE similar to own user but slightly softer
const sfxRemoteUserStoppedScreenshare = () => {
    const osc1 = createOsc('sine', 900);
    const gain1 = createGain(0.06);

    osc1.frequency.exponentialRampToValueAtTime(550, now() + 0.18);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now() + 0.2);

    osc1.connect(gain1).connect(getAudioCtx().destination);
    osc1.start();
    osc1.stop(now() + 0.2);

    const osc2 = createOsc('triangle', 1100);
    const gain2 = createGain(0.02);

    osc2.frequency.exponentialRampToValueAtTime(700, now() + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now() + 0.2);

    osc2.connect(gain2).connect(getAudioCtx().destination);
    osc2.start(now() + 0.05);
    osc2.stop(now() + 0.2);
};

// INCOMING_CALL_RING
const sfxIncomingCallRing = () => {
    const chord = [
        { freq: 440, gain: 0.06 }, // A
        { freq: 554, gain: 0.05 }, // C#
        { freq: 659, gain: 0.04 } // E
    ];

    const burst = (offset: number) => {
        chord.forEach(({ freq, gain: g }) => {
            const osc = createOsc('sine', freq);
            const gain = createGain(g);

            gain.gain.exponentialRampToValueAtTime(
                0.0001,
                now() + offset + 0.4
            );

            osc.connect(gain).connect(getAudioCtx().destination);
            osc.start(now() + offset);
            osc.stop(now() + offset + 0.4);
        });

        // Octave-up triangle adds a phone-bell shimmer without harshness.
        const osc2 = createOsc('triangle', 880);
        const gain2 = createGain(0.025);

        gain2.gain.exponentialRampToValueAtTime(0.0001, now() + offset + 0.35);

        osc2.connect(gain2).connect(getAudioCtx().destination);
        osc2.start(now() + offset + 0.05);
        osc2.stop(now() + offset + 0.4);
    };

    burst(0);
    burst(0.55);
};

// PEER_INCOMING_CALL_RING brighter ascending arpeggio for the callee side.
// The caller hears the mellow A-minor chord from sfxIncomingCallRing as
// their dial tone; the callee hears this so the two ends are audibly
// distinct and the incoming side feels more attention-grabbing.
const sfxPeerIncomingCallRing = () => {
    // G major arpeggio rising: G5 -> B5 -> D6, then octave shimmer.
    const notes = [
        { freq: 784, offset: 0 }, // G5
        { freq: 988, offset: 0.09 }, // B5
        { freq: 1175, offset: 0.18 } // D6
    ];

    const burst = (start: number) => {
        notes.forEach(({ freq, offset }) => {
            const t = now() + start + offset;
            const osc = createOsc('sine', freq);
            const gain = createGain(0.08);

            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);

            osc.connect(gain).connect(getAudioCtx().destination);
            osc.start(t);
            osc.stop(t + 0.2);
        });

        // Brightness layer: triangle on the top note an octave up, fading
        // through the burst tail. Gives it a notification-bell feel.
        const osc2 = createOsc('triangle', 2349); // D7
        const gain2 = createGain(0.025);

        gain2.gain.exponentialRampToValueAtTime(0.0001, now() + start + 0.45);

        osc2.connect(gain2).connect(getAudioCtx().destination);
        osc2.start(now() + start + 0.18);
        osc2.stop(now() + start + 0.45);
    };

    burst(0);
    burst(0.55);
};

// Start a looping ring tone. Returns a stop function. Use from any
// effect that conditionally rings (e.g. while a call invite is pending).
export const startCallRingLoop = (): (() => void) => {
    sfxIncomingCallRing();
    // 2.5s cadence: ~1s of ring (two bursts) + ~1.5s of silence.
    const interval = setInterval(sfxIncomingCallRing, 2500);
    return () => clearInterval(interval);
};

// Callee-side variant. Brighter arpeggio so caller and callee don't sound
// identical and the incoming side feels alerting rather than waiting.
export const startPeerIncomingCallRingLoop = (): (() => void) => {
    sfxPeerIncomingCallRing();
    const interval = setInterval(sfxPeerIncomingCallRing, 2300);
    return () => clearInterval(interval);
};

export const playSound = (type: SoundType) => {
    switch (type) {
        case SoundType.MESSAGE_RECEIVED:
            return sfxMessageReceived();
        case SoundType.MESSAGE_SENT:
            return sfxMessageSent();

        case SoundType.OWN_USER_JOINED_VOICE_CHANNEL:
            return sfxOwnUserJoinedVoiceChannel();
        case SoundType.OWN_USER_LEFT_VOICE_CHANNEL:
            return sfxOwnUserLeftVoiceChannel();

        case SoundType.OWN_USER_MUTED_MIC:
            return sfxOwnUserMutedMic();
        case SoundType.OWN_USER_UNMUTED_MIC:
            return sfxOwnUserUnmutedMic();

        case SoundType.OWN_USER_MUTED_SOUND:
            return sfxOwnUserMutedSound();
        case SoundType.OWN_USER_UNMUTED_SOUND:
            return sfxOwnUserUnmutedSound();

        case SoundType.OWN_USER_STARTED_WEBCAM:
            return sfxOwnUserStartedWebcam();
        case SoundType.OWN_USER_STOPPED_WEBCAM:
            return sfxOwnUserStoppedWebcam();

        case SoundType.OWN_USER_STARTED_SCREENSHARE:
            return sfxOwnUserStartedScreenshare();
        case SoundType.OWN_USER_STOPPED_SCREENSHARE:
            return sfxOwnUserStoppedScreenshare();

        case SoundType.REMOTE_USER_JOINED_VOICE_CHANNEL:
            return sfxRemoteUserJoinedVoiceChannel();
        case SoundType.REMOTE_USER_LEFT_VOICE_CHANNEL:
            return sfxRemoteUserLeftVoiceChannel();
        case SoundType.REMOTE_USER_STARTED_SCREENSHARE:
            return sfxRemoteUserStartedScreenshare();
        case SoundType.REMOTE_USER_STOPPED_SCREENSHARE:
            return sfxRemoteUserStoppedScreenshare();

        case SoundType.INCOMING_CALL_RING:
            return sfxIncomingCallRing();

        default:
            return;
    }
};
