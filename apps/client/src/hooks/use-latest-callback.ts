import { useCallback, useLayoutEffect, useRef } from 'react';

// Stable identity that always calls the latest `fn`. For handlers that
// read current form values but are passed to memoized children (save
// buttons, footers): a useCallback over `values` changes on every
// keystroke and re-renders them. Only call the result from events or
// effects, not during render: the ref updates in a layout effect.
const useLatestCallback = <A extends unknown[], R>(
    fn: (...args: A) => R
): ((...args: A) => R) => {
    const ref = useRef(fn);

    useLayoutEffect(() => {
        ref.current = fn;
    });

    return useCallback((...args: A) => ref.current(...args), []);
};

export { useLatestCallback };
