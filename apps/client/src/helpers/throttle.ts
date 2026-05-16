// Leading+trailing throttle, matches lodash's default semantics:
// first call fires immediately, repeated calls within waitMs collapse to a
// single trailing invocation with the latest args. Exposes .cancel() to
// drop any pending trailing call (used when the consumer is about to send
// the final value itself, e.g. on submit).
type ThrottledFn<Args extends unknown[]> = ((...args: Args) => void) & {
    cancel: () => void;
    flush: () => void;
};

const throttle = <Args extends unknown[]>(
    fn: (...args: Args) => unknown,
    waitMs: number
): ThrottledFn<Args> => {
    let lastInvokeTime = 0;
    let trailingTimer: ReturnType<typeof setTimeout> | null = null;
    let trailingArgs: Args | null = null;

    const invoke = (args: Args) => {
        lastInvokeTime = Date.now();
        trailingArgs = null;
        fn(...args);
    };

    const throttled = (...args: Args) => {
        const elapsed = Date.now() - lastInvokeTime;

        if (elapsed >= waitMs) {
            if (trailingTimer) {
                clearTimeout(trailingTimer);
                trailingTimer = null;
            }
            invoke(args);
            return;
        }

        trailingArgs = args;

        if (!trailingTimer) {
            trailingTimer = setTimeout(() => {
                trailingTimer = null;
                if (trailingArgs) invoke(trailingArgs);
            }, waitMs - elapsed);
        }
    };

    throttled.cancel = () => {
        if (trailingTimer) {
            clearTimeout(trailingTimer);
            trailingTimer = null;
        }
        trailingArgs = null;
    };

    throttled.flush = () => {
        if (trailingTimer) {
            clearTimeout(trailingTimer);
            trailingTimer = null;
        }
        if (trailingArgs) invoke(trailingArgs);
    };

    return throttled;
};

export { throttle };
