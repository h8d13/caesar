const DTLN_WORKLET_URL = '/dtln/dtln-processor.js';
const DTLN_WORKLET_NAME = 'DtlnProcessor';
const DTLN_READY_TIMEOUT_MS = 10000;
const DTLN_CACHE_NAME = 'dtln-worklet-v3';
const DTLN_CACHE_ENABLED = true;

type TDTLNWorkletAvailability = {
    available: boolean;
    reason?: string;
};

const availabilitySubscribers = new Set<() => void>();
let runtimeUnavailableReason: string | undefined;
let availabilitySnapshotCache: TDTLNWorkletAvailability | null = null;

const notifyAvailabilitySubscribers = () => {
    availabilitySubscribers.forEach((listener) => listener());
};

const isDTLNWorkletSupported = () => {
    if (typeof window === 'undefined') return false;

    return (
        typeof window.AudioWorkletNode !== 'undefined' &&
        typeof window.AudioContext !== 'undefined' &&
        'audioWorklet' in window.AudioContext.prototype &&
        typeof WebAssembly !== 'undefined' &&
        typeof caches !== 'undefined'
    );
};

const subscribeDTLNWorkletAvailability = (listener: () => void) => {
    availabilitySubscribers.add(listener);

    return () => {
        availabilitySubscribers.delete(listener);
    };
};

const getDTLNWorkletAvailabilitySnapshot = (): TDTLNWorkletAvailability => {
    const nextSnapshot: TDTLNWorkletAvailability = !isDTLNWorkletSupported()
        ? {
              available: false,
              reason: 'This browser does not support AudioWorklet, WebAssembly, or Cache API.'
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

const markDTLNWorkletUnavailable = (reason: string) => {
    if (runtimeUnavailableReason) return;

    runtimeUnavailableReason = reason;
    notifyAvailabilitySubscribers();
};

// resolves to a blob url for the worklet script. Within a session the same
// promise is reused (no re-fetch, no re-parse). Across page loads the response
// is served from the Cache API so the 4MB bundle is not re-downloaded.
let dtlnBlobUrlPromise: Promise<string> | null = null;

const getDTLNBlobUrl = (): Promise<string> => {
    if (!dtlnBlobUrlPromise) {
        dtlnBlobUrlPromise = (
            DTLN_CACHE_ENABLED
                ? caches.open(DTLN_CACHE_NAME).then(async (cache) => {
                      let response = await cache.match(DTLN_WORKLET_URL);

                      if (!response) {
                          await cache.add(DTLN_WORKLET_URL);
                          response = await cache.match(DTLN_WORKLET_URL);
                      }

                      if (!response) {
                          throw new Error('failed to cache DTLN worklet');
                      }

                      return response.blob();
                  })
                : fetch(DTLN_WORKLET_URL).then((r) => r.blob())
        ).then((blob) => URL.createObjectURL(blob));
    }

    return dtlnBlobUrlPromise;
};

const workletLoadPromises = new WeakMap<BaseAudioContext, Promise<void>>();

const ensureDTLNWorkletLoaded = async (audioContext: AudioContext) => {
    if (!isDTLNWorkletSupported()) {
        throw new Error(
            'AudioWorklet, WebAssembly, or Cache API is not supported in this browser.'
        );
    }

    let loadPromise = workletLoadPromises.get(audioContext);

    if (!loadPromise) {
        loadPromise = getDTLNBlobUrl().then((blobUrl) =>
            audioContext.audioWorklet.addModule(blobUrl)
        );
        workletLoadPromises.set(audioContext, loadPromise);
    }

    await loadPromise;
};

const createDTLNWorkletNode = async (
    audioContext: AudioContext
): Promise<AudioWorkletNode> => {
    await ensureDTLNWorkletLoaded(audioContext);

    const node = new AudioWorkletNode(audioContext, DTLN_WORKLET_NAME);

    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('DTLN worklet initialization timed out'));
        }, DTLN_READY_TIMEOUT_MS);

        const handler = (event: MessageEvent) => {
            if (
                typeof event.data === 'string' &&
                event.data.startsWith('ready:')
            ) {
                clearTimeout(timeout);
                node.port.removeEventListener('message', handler);
                resolve();
            }
        };

        node.port.addEventListener('message', handler);
        node.port.start();

        node.onprocessorerror = (e) => {
            clearTimeout(timeout);
            reject(e);
        };
    });

    return node;
};

export {
    createDTLNWorkletNode,
    getDTLNWorkletAvailabilitySnapshot,
    isDTLNWorkletSupported,
    markDTLNWorkletUnavailable,
    subscribeDTLNWorkletAvailability
};
