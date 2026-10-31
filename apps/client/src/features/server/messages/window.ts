import type { TJoinedMessage } from '@caesar/shared';

// A channel's messages are one list, oldest first. A jump that does not reach
// the loaded tail splits it into two contiguous segments: the jump window and
// the tail, which keeps receiving live messages. newerCursor is the createdAt
// of the window's newest message; only messages up to it are shown, so the
// hole between the segments never renders. Paging newer closes the hole, or
// dropping the window returns to the tail.
export type TMessageWindow = {
    messages: TJoinedMessage[];
    newerCursor: number | undefined;
};

export const merge = (
    existing: TJoinedMessage[],
    incoming: TJoinedMessage[]
) => {
    const ids = new Set(existing.map((m) => m.id));

    return [...existing, ...incoming.filter((m) => !ids.has(m.id))].sort(
        (a, b) => a.createdAt - b.createdAt
    );
};

const tailOf = ({ messages, newerCursor }: TMessageWindow) =>
    newerCursor === undefined
        ? messages
        : messages.filter((m) => m.createdAt > newerCursor);

// The page covers its first row up to its last, the tail its first row up
// to live: once they touch (or the server has nothing newer) no hole is left
// and the window closes.
const nextNewerCursor = (
    page: TJoinedMessage[],
    tailStart: TJoinedMessage | undefined,
    newerCursor: number | null
) => {
    const newest = page.at(-1);

    if (newerCursor === null) return;

    return newest && tailStart && newest.createdAt >= tailStart.createdAt
        ? undefined
        : newerCursor;
};

export const visibleMessages = ({ messages, newerCursor }: TMessageWindow) =>
    newerCursor === undefined
        ? messages
        : messages.filter((m) => m.createdAt <= newerCursor);

// page: oldest first. A previous window is dropped: only the tail is known to
// be contiguous with it.
export const placeJumpWindow = (
    stored: TMessageWindow,
    page: TJoinedMessage[],
    newerCursor: number | null
): TMessageWindow => {
    const tail = tailOf(stored);

    return {
        messages: merge(tail, page),
        newerCursor: nextNewerCursor(page, tail[0], newerCursor)
    };
};

// page: oldest first, fetched with `from` as the forward cursor. A page for a
// window that has since moved or closed is dropped: it would land in the
// middle of whatever is shown now.
export const appendNewerPage = (
    stored: TMessageWindow,
    page: TJoinedMessage[],
    from: number,
    newerCursor: number | null
): TMessageWindow => {
    if (stored.newerCursor !== from) return stored;

    const tailStart = stored.messages.find((m) => m.createdAt > from);

    return {
        messages: merge(stored.messages, page),
        newerCursor: nextNewerCursor(page, tailStart, newerCursor)
    };
};

export const dropJumpWindow = (stored: TMessageWindow): TMessageWindow => ({
    messages: tailOf(stored),
    newerCursor: undefined
});
