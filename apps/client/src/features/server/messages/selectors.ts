import type { IRootState } from '@/features/store';
import { createCachedSelector } from 're-reselect';
import { visibleMessages } from './window';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DEFAULT_ARRAY: any[] = [];

export const typingMapSelector = (state: IRootState) => state.server.typingMap;

export const messagesByChannelIdSelector = (
    state: IRootState,
    channelId: number
) => state.server.messagesMap[channelId] || DEFAULT_ARRAY;

export const newerCursorSelector = (state: IRootState, channelId: number) =>
    state.server.newerCursorMap[channelId];

// what the channel view renders: the list above includes the live tail
// hidden behind a detached jump window (unread checks still need it)
export const visibleMessagesSelector = createCachedSelector(
    [messagesByChannelIdSelector, newerCursorSelector],
    (messages, newerCursor) => visibleMessages({ messages, newerCursor })
)((_, channelId: number) => channelId);

// highest-id message authored by the own user in the channel. used by
// the DM read indicator so the "Read HH:mm" mark only appears on the
// latest own message and slides forward as new own messages are sent.
export const latestOwnMessageIdSelector = createCachedSelector(
    [
        messagesByChannelIdSelector,
        (state: IRootState, _channelId: number) => state.server.ownUserId
    ],
    (messages, ownUserId) => {
        if (!ownUserId) return;
        let latest: number | undefined;
        for (const m of messages) {
            if (
                m.userId === ownUserId &&
                (latest === undefined || m.id > latest)
            ) {
                latest = m.id;
            }
        }
        return latest;
    }
)((_, channelId: number) => channelId);
