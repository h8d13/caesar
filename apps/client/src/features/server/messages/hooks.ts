import { store, type IRootState } from '@/features/store';
import { getTRPCClient } from '@/lib/trpc';
import {
    DEFAULT_MESSAGES_LIMIT,
    getTrpcError,
    type TJoinedMessage
} from '@caesar/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';
import {
    addMessages,
    addNewerMessages,
    dropJumpWindow,
    setJumpWindow
} from './actions';
import { lockAutoScroll } from './scroll-lock';
import {
    latestOwnMessageIdSelector,
    newerCursorSelector,
    visibleMessagesSelector
} from './selectors';

export const useMessagesByChannelId = (channelId: number) =>
    useSelector((state: IRootState) =>
        visibleMessagesSelector(state, channelId)
    );

const oldestVisibleCreatedAt = (channelId: number) =>
    visibleMessagesSelector(store.getState(), channelId)[0]?.createdAt;

export const useLatestOwnMessageId = (channelId: number) =>
    useSelector((state: IRootState) =>
        latestOwnMessageIdSelector(state, channelId)
    );

const useGroupedMessages = (messages: TJoinedMessage[]) =>
    useMemo(() => {
        const grouped = messages.reduce((acc, message) => {
            const last = acc[acc.length - 1];

            if (!last) return [[message]];

            const lastMessage = last[last.length - 1];

            if (lastMessage.userId === message.userId) {
                const lastDate = lastMessage.createdAt;
                const currentDate = message.createdAt;
                const timeDifference =
                    Math.abs(currentDate - lastDate) / 1000 / 60;

                if (timeDifference < 1) {
                    last.push(message);
                    return acc;
                }
            }

            acc.push([message]);
            return acc;
        }, [] as TJoinedMessage[][]);

        return grouped;
    }, [messages]);

// undefined: the page went stale before it arrived and was dropped
type TFetchPage = (
    cursor: number | null
) => Promise<{ nextCursor: number | null } | undefined>;

// a page of channel messages, oldest first like the store (the server
// sends newest first)
const fetchChannelMessagesPage = async (input: {
    channelId: number;
    cursor?: number | null;
    limit: number;
    newerCursor?: number;
    targetMessageId?: number;
}) => {
    const page = await getTRPCClient().messages.get.query(input);

    return { ...page, messages: page.messages.reverse() };
};

const getMessagesContainer = () =>
    document.querySelector('[data-messages-container]');

const findMessageElement = (messageId: number) =>
    getMessagesContainer()?.querySelector(`[data-message-id="${messageId}"]`) ??
    null;

const nextFrame = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const highlightMessageElement = async (element: Element) => {
    // yield twice: once for layout, once for paint ensures the browser
    // has fully laid out all newly inserted messages before we scroll
    await nextFrame();
    await nextFrame();

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.classList.add('bg-secondary');

    setTimeout(() => {
        element.classList.remove('bg-secondary');
    }, 2000);
};

const waitForMessageElement = (
    messageId: number,
    timeoutMs = 3000
): Promise<Element | null> =>
    new Promise((resolve) => {
        const existing = findMessageElement(messageId);

        if (existing) {
            resolve(existing);
            return;
        }

        const container = getMessagesContainer();

        if (!container) {
            resolve(null);
            return;
        }

        const observer = new MutationObserver(() => {
            const element = findMessageElement(messageId);

            if (element) {
                observer.disconnect();
                resolve(element);
            }
        });

        observer.observe(container, { childList: true, subtree: true });

        setTimeout(() => {
            observer.disconnect();
            resolve(null);
        }, timeoutMs);
    });

const usePaginatedMessages = (
    messages: TJoinedMessage[],
    fetchPage: TFetchPage
) => {
    const [fetching, setFetching] = useState(false);
    const [loading, setLoading] = useState(messages.length === 0);
    const [hasMore, setHasMore] = useState(true);
    // older pages continue from the oldest shown message: a jump can move
    // that edge, so a cursor kept from the last page would go stale
    const cursor = messages[0]?.createdAt ?? null;

    const fetchMessages = useCallback(
        async (cursorToFetch: number | null) => {
            setFetching(true);

            try {
                const page = await fetchPage(cursorToFetch);

                if (page) setHasMore(page.nextCursor !== null);
            } catch (error) {
                toast.error(getTrpcError(error, 'Failed to load messages'));
            } finally {
                setFetching(false);
                setLoading(false);
            }
        },
        [fetchPage]
    );

    const loadMore = useCallback(async () => {
        if (fetching || !hasMore) return;

        await fetchMessages(cursor);
    }, [fetching, hasMore, cursor, fetchMessages]);

    const isEmpty = useMemo(
        () => !messages.length && !fetching,
        [messages.length, fetching]
    );

    const groupedMessages = useGroupedMessages(messages);

    return {
        fetching,
        loading,
        hasMore,
        messages,
        loadMore,
        groupedMessages,
        isEmpty,
        fetchMessages,
        setHasMore
    };
};

export const useMessages = (channelId: number) => {
    const messages = useMessagesByChannelId(channelId);
    const inited = useRef(false);

    const newerCursor = useSelector((state: IRootState) =>
        newerCursorSelector(state, channelId)
    );
    const fetchingNewer = useRef(false);

    const fetchPage = useCallback(
        async (cursorToFetch: number | null) => {
            const { messages: page, nextCursor } =
                await fetchChannelMessagesPage({
                    channelId,
                    cursor: cursorToFetch,
                    limit: DEFAULT_MESSAGES_LIMIT
                });

            // a jump moved the oldest edge meanwhile: this page would sit
            // below it with a hole in between
            if (
                cursorToFetch !== null &&
                oldestVisibleCreatedAt(channelId) !== cursorToFetch
            ) {
                return;
            }

            addMessages(channelId, page);

            return { nextCursor };
        },
        [channelId]
    );

    const { fetchMessages, setHasMore, ...paginated } = usePaginatedMessages(
        messages,
        fetchPage
    );

    useEffect(() => {
        if (inited.current) return;

        // a jump window left from an earlier visit reopens at the present
        dropJumpWindow(channelId);
        void fetchMessages(null);

        inited.current = true;
    }, [channelId, fetchMessages]);

    // pages from a jump window back toward the live tail
    const loadNewer = useCallback(async () => {
        if (newerCursor === undefined || fetchingNewer.current) return;

        fetchingNewer.current = true;

        try {
            const { messages: page, newerCursor: next } =
                await fetchChannelMessagesPage({
                    channelId,
                    newerCursor,
                    limit: DEFAULT_MESSAGES_LIMIT
                });

            addNewerMessages(channelId, page, newerCursor, next);
        } catch (error) {
            toast.error(getTrpcError(error, 'Failed to load messages'));
        } finally {
            fetchingNewer.current = false;
        }
    }, [channelId, newerCursor]);

    // the tail kept following live messages, so it is shown as is
    const jumpToPresent = useCallback(async () => {
        dropJumpWindow(channelId);
        setHasMore(true);

        if (oldestVisibleCreatedAt(channelId) === undefined) {
            await fetchMessages(null);
        }
    }, [channelId, fetchMessages, setHasMore]);

    const scrollToMessage = useCallback(
        async (messageId: number) => {
            // check if the message is already rendered in the messages container
            const existing = findMessageElement(messageId);

            if (existing) {
                // covers the smooth scroll against initial-scroll retries
                lockAutoScroll(1_500);
                void highlightMessageElement(existing);
                return;
            }

            // generous: the lock must survive the fetch + render below
            lockAutoScroll(10_000);

            // not loaded: fetch a window around the target
            try {
                const {
                    messages: page,
                    nextCursor,
                    newerCursor: windowNewerCursor
                } = await fetchChannelMessagesPage({
                    channelId,
                    limit: DEFAULT_MESSAGES_LIMIT,
                    targetMessageId: messageId
                });

                setJumpWindow(channelId, page, windowNewerCursor);

                // the window now is the oldest edge: its cursor applies
                if (oldestVisibleCreatedAt(channelId) === page[0]?.createdAt) {
                    setHasMore(nextCursor !== null);
                }
            } catch (error) {
                lockAutoScroll(0);
                toast.error(getTrpcError(error, 'Failed to jump to message'));
                return;
            }

            // wait for React to render the new messages into the DOM
            const element = await waitForMessageElement(messageId);

            // shrink the lock to a trailing grace for the smooth scroll
            lockAutoScroll(1_500);

            if (element) {
                void highlightMessageElement(element);
            }
        },
        [channelId, setHasMore]
    );

    return {
        ...paginated,
        scrollToMessage,
        hasNewer: newerCursor !== undefined,
        loadNewer,
        jumpToPresent
    };
};
