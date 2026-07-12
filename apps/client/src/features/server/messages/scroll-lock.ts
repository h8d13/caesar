// Jump-to-message (search results, pinned messages) must not fight the
// channel scroll controller: its initial-scroll retries and stick-to-bottom
// timers fire on the very renders a jump causes (page prepend, channel
// mount) and yank the view back to the bottom. Time-based lock instead of
// a boolean because scrollIntoView({behavior:'smooth'}) keeps animating
// after the jump code returns.
let lockedUntil = 0;

export const lockAutoScroll = (ms: number) => {
    lockedUntil = performance.now() + ms;
};

export const isAutoScrollLocked = () => performance.now() < lockedUntil;
