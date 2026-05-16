// Leading+trailing throttle, matches lodash's default semantics:
// first call fires immediately, repeated calls within waitMs collapse to a
// single trailing invocation with the latest args.
const throttle = <Args extends unknown[]>(
    fn: (...args: Args) => unknown,
    waitMs: number
) => {
    let lastInvokeTime = 0;
    let trailingTimer: ReturnType<typeof setTimeout> | null = null;
    let trailingArgs: Args | null = null;

    const invoke = (args: Args) => {
        lastInvokeTime = Date.now();
        trailingArgs = null;
        fn(...args);
    };

    return (...args: Args) => {
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
};

export { throttle };
