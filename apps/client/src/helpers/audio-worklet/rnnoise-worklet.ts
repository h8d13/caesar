import rnnoiseProcessorUrl from '@/audio-worklets/rnnoise-processor.js?url';
import { RNNOISE_WORKLET_NAME } from '@/helpers/audio-gate';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Vite resolves ?url imports from node_modules
import rnnoiseWasmUrl from '@jitsi/rnnoise-wasm/dist/rnnoise.wasm?url';

type TRNNoiseWorkletConfig = {
    enabled?: boolean;
};

type TRNNoiseWorkletAvailability = {
    available: boolean;
    reason?: string;
};

const workletLoadPromises = new WeakMap<BaseAudioContext, Promise<void>>();
const availabilitySubscribers = new Set<() => void>();
let runtimeUnavailableReason: string | undefined;
let availabilitySnapshotCache: TRNNoiseWorkletAvailability | null = null;
let wasmBinary: ArrayBuffer | null = null;

const notifyAvailabilitySubscribers = () => {
    availabilitySubscribers.forEach((listener) => listener());
};

const isRNNoiseWorkletSupported = () => {
    if (typeof window === 'undefined') return false;

    return (
        typeof window.AudioWorkletNode !== 'undefined' &&
        typeof window.AudioContext !== 'undefined' &&
        'audioWorklet' in window.AudioContext.prototype &&
        typeof WebAssembly !== 'undefined'
    );
};

const subscribeRNNoiseWorkletAvailability = (listener: () => void) => {
    availabilitySubscribers.add(listener);

    return () => {
        availabilitySubscribers.delete(listener);
    };
};

const getRNNoiseWorkletAvailabilitySnapshot =
    (): TRNNoiseWorkletAvailability => {
        const nextSnapshot: TRNNoiseWorkletAvailability =
            !isRNNoiseWorkletSupported()
                ? {
                      available: false,
                      reason: 'This browser does not support AudioWorklet or WebAssembly.'
                  }
                : runtimeUnavailableReason
                  ? {
                        available: false,
                        reason: runtimeUnavailableReason
                    }
                  : { available: true };

        if (
            availabilitySnapshotCache &&
            availabilitySnapshotCache.available === nextSnapshot.available &&
            availabilitySnapshotCache.reason === nextSnapshot.reason
        ) {
            return availabilitySnapshotCache;
        }

        availabilitySnapshotCache = nextSnapshot;

        return availabilitySnapshotCache;
    };

const markRNNoiseWorkletUnavailable = (reason: string) => {
    if (runtimeUnavailableReason) return;

    runtimeUnavailableReason = reason;
    notifyAvailabilitySubscribers();
};

const postRNNoiseWorkletConfig = (
    node: AudioWorkletNode,
    config: TRNNoiseWorkletConfig
) => {
    node.port.postMessage({
        type: 'config',
        enabled: config.enabled
    });
};

const loadRNNoiseWasmBinary = async (): Promise<ArrayBuffer> => {
    if (wasmBinary) return wasmBinary;

    const response = await fetch(rnnoiseWasmUrl);

    if (!response.ok) {
        throw new Error(`Failed to fetch RNNoise WASM: ${response.status}`);
    }

    wasmBinary = await response.arrayBuffer();

    return wasmBinary;
};

const ensureRNNoiseWorkletLoaded = async (audioContext: AudioContext) => {
    if (!isRNNoiseWorkletSupported()) {
        throw new Error(
            'AudioWorklet or WebAssembly is not supported in this browser.'
        );
    }

    let loadPromise = workletLoadPromises.get(audioContext);

    if (!loadPromise) {
        loadPromise = audioContext.audioWorklet.addModule(rnnoiseProcessorUrl);
        workletLoadPromises.set(audioContext, loadPromise);
    }

    await loadPromise;
};

const createRNNoiseWorkletNode = async (
    audioContext: AudioContext,
    config: TRNNoiseWorkletConfig
): Promise<AudioWorkletNode> => {
    await ensureRNNoiseWorkletLoaded(audioContext);

    const node = new AudioWorkletNode(audioContext, RNNOISE_WORKLET_NAME);

    postRNNoiseWorkletConfig(node, config);

    // load and send the WASM binary to the worklet
    const binary = await loadRNNoiseWasmBinary();
    const binaryCopy = binary.slice(0);

    node.port.postMessage({ type: 'wasm-binary', binary: binaryCopy }, [
        binaryCopy
    ]);

    // wait for the worklet to signal it's ready
    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('RNNoise WASM initialization timed out'));
        }, 10000);

        const handler = (event: MessageEvent) => {
            const data = event.data;

            if (!data || data.type !== 'ready') return;

            clearTimeout(timeout);
            node.port.removeEventListener('message', handler);

            if (data.success) {
                resolve();
            } else {
                reject(
                    new Error(
                        data.error || 'RNNoise WASM initialization failed'
                    )
                );
            }
        };

        node.port.addEventListener('message', handler);
        node.port.start();
    });

    return node;
};

export {
    createRNNoiseWorkletNode,
    getRNNoiseWorkletAvailabilitySnapshot,
    isRNNoiseWorkletSupported,
    markRNNoiseWorkletUnavailable,
    postRNNoiseWorkletConfig,
    subscribeRNNoiseWorkletAvailability
};
