import {
    browserNotificationsForDmsSelector,
    browserNotificationsForMentionsSelector,
    browserNotificationsSelector,
    dmsOpenSelector,
    selectedDmChannelIdSelector,
    threadSidebarDataSelector
} from '@/features/app/selectors';
import { store } from '@/features/store';
import { getFileUrl } from '@/helpers/get-file-url';
import { getRegistration } from '@/lib/push';
import { getTRPCClient } from '@/lib/trpc';
import { hasMention, TYPING_MS, type TJoinedMessage } from '@caesar/shared';
import {
    channelByIdSelector,
    selectedChannelIdSelector
} from '../channels/selectors';
import { serverSliceActions } from '../slice';
import { playSound } from '../sounds/actions';
import { SoundType } from '../types';
import { ownUserIdSelector, userByIdSelector } from '../users/selectors';
import { threadMessagesMapSelector } from './selectors';

const sendBrowserNotification = (
    message: TJoinedMessage,
    channelId: number
) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
        return;
    }

    const state = store.getState();

    const user = userByIdSelector(state, message.userId);
    const channel = channelByIdSelector(state, channelId);

    if (!user || !channel) {
        return;
    }

    // Body is intentionally generic. Message content can be ephemeral E2EE
    // ciphertext (base64) which must never reach the OS notification layer,
    // and even plaintext leaks sensitive info to notification daemons /
    // lock-screen previews / sync to other devices.
    //
    // DM channels carry an internal `DM - {userIdA}:{userIdB}` name (e.g.
    // "DM - 2:31") which reads as a clock time in the notification chrome.
    // For DMs we just show the sender; for regular channels we keep the
    // `in #<channel>` suffix.
    const userName = user?.name ?? 'Unknown';
    const title = channel?.isDm
        ? userName
        : `${userName} in #${channel?.name ?? 'unknown'}`;
    const body = 'You have a new message.';
    const icon = user?.avatar ? getFileUrl(user.avatar) : undefined;

    // Android Chrome has no Notification() constructor (throws); the
    // service worker path works everywhere, so the constructor is only
    // a fallback for when registration failed.
    void (async () => {
        try {
            const registration = await getRegistration();

            if (registration) {
                await registration.showNotification(title, { body, icon });
                return;
            }
        } catch {
            // fall through to the constructor
        }

        try {
            new Notification(title, { body, icon });
        } catch (e) {
            console.error('browser notification failed', e);
        }
    })();
};

const typingTimeouts: { [key: string]: NodeJS.Timeout } = {};

const getTypingKey = (channelId: number, userId: number) =>
    `${channelId}-${userId}`;

export const addMessages = (
    channelId: number,
    messages: TJoinedMessage[],
    opts: { prepend?: boolean } = {},
    isSubscriptionMessage = false
) => {
    const state = store.getState();
    const selectedChannelId = selectedChannelIdSelector(state);
    const selectedDmChannelId = selectedDmChannelIdSelector(state);
    const dmsOpen = dmsOpenSelector(state);

    const rootMessages = messages.filter((m) => !m.parentMessageId);
    const threadReplies = messages.filter((m) => !!m.parentMessageId);

    if (rootMessages.length > 0) {
        store.dispatch(
            serverSliceActions.addMessages({
                channelId,
                messages: rootMessages,
                opts
            })
        );
    }

    const repliesByParent = new Map<number, TJoinedMessage[]>();

    for (const reply of threadReplies) {
        const parentId = reply.parentMessageId!;

        if (!repliesByParent.has(parentId)) {
            repliesByParent.set(parentId, []);
        }

        repliesByParent.get(parentId)!.push(reply);
    }

    for (const [parentMessageId, replies] of repliesByParent) {
        store.dispatch(
            serverSliceActions.addThreadMessages({
                parentMessageId,
                messages: replies,
                opts
            })
        );
    }

    rootMessages.forEach((message) => {
        removeTypingUser(channelId, message.userId);
    });

    threadReplies.forEach((message) => {
        if (message.parentMessageId) {
            removeThreadTypingUser(message.parentMessageId, message.userId);
        }
    });

    if (isSubscriptionMessage && messages.length > 0) {
        const state = store.getState();
        const ownUserId = ownUserIdSelector(state);
        const hasBrowserNotificationsEnabled =
            browserNotificationsSelector(state);
        const notificationsForMentionsOnly =
            browserNotificationsForMentionsSelector(state);
        const notificationsForDmsOnly =
            browserNotificationsForDmsSelector(state);
        const channelIsDm = !!channelByIdSelector(state, channelId)?.isDm;
        const targetMessage = messages[0];
        const isFromOwnUser = ownUserId === targetMessage.userId;
        // selectedDmChannelId persists across DM-panel close (so reopening
        // returns to the same conversation), but it must not count as
        // "currently viewing" once the panel is closed - otherwise unread
        // updates + browser notifications get suppressed forever after
        // first DM open.
        const isChannelSelected =
            selectedChannelId === channelId ||
            (dmsOpen && selectedDmChannelId === channelId);
        const isWindowHidden = document?.hidden;

        if (!isFromOwnUser) {
            const isThreadReply = !!targetMessage.parentMessageId;

            if (isThreadReply) {
                const { isOpen, parentMessageId } =
                    threadSidebarDataSelector(state);

                // only play sound if the user has this thread open
                if (
                    isOpen &&
                    parentMessageId === targetMessage.parentMessageId
                ) {
                    playSound(SoundType.MESSAGE_RECEIVED);
                }
            } else {
                playSound(SoundType.MESSAGE_RECEIVED);
            }

            // only send browser notifications if the user is not currently viewing this channel
            if (!isChannelSelected || isWindowHidden) {
                // Precedence: "all" wins outright; otherwise mentions-only
                // and DMs-only filters can each independently allow a
                // notification (OR'd, not AND'd).
                if (hasBrowserNotificationsEnabled) {
                    sendBrowserNotification(targetMessage, channelId);
                } else {
                    const isMentioned =
                        notificationsForMentionsOnly &&
                        hasMention(targetMessage.content ?? null, ownUserId);
                    const matchesDmFilter =
                        notificationsForDmsOnly && channelIsDm;

                    if (isMentioned || matchesDmFilter) {
                        sendBrowserNotification(targetMessage, channelId);
                    }
                }
            }
        }

        if (isChannelSelected && !isFromOwnUser && rootMessages.length > 0) {
            const trpc = getTRPCClient();

            // fire-and-forget read receipt: log rejection so a broken
            // markAsRead doesn't silently rot the unread badge
            trpc.channels.markAsRead.mutate({ channelId }).catch((e) => {
                console.error('markAsRead failed', e);
            });
        }
    }
};

export const updateMessage = (channelId: number, message: TJoinedMessage) => {
    if (message.parentMessageId) {
        store.dispatch(
            serverSliceActions.updateThreadMessage({
                parentMessageId: message.parentMessageId,
                message
            })
        );
    } else {
        store.dispatch(
            serverSliceActions.updateMessage({ channelId, message })
        );
    }
};

export const clearChannelMessages = (channelId: number) => {
    store.dispatch(serverSliceActions.clearChannelMessages({ channelId }));
};

export const deleteMessage = (channelId: number, messageId: number) => {
    // delete from both maps, the message could be a thread reply or root
    store.dispatch(serverSliceActions.deleteMessage({ channelId, messageId }));

    const state = store.getState();
    const threadMessagesMap = threadMessagesMapSelector(state);

    for (const parentId in threadMessagesMap) {
        const threadMessages = threadMessagesMap[parentId];

        if (threadMessages?.some((m) => m.id === messageId)) {
            store.dispatch(
                serverSliceActions.deleteThreadMessage({
                    parentMessageId: Number(parentId),
                    messageId
                })
            );

            break;
        }
    }
};

export const addThreadMessages = (
    parentMessageId: number,
    messages: TJoinedMessage[],
    opts: { prepend?: boolean } = {}
) => {
    store.dispatch(
        serverSliceActions.addThreadMessages({
            parentMessageId,
            messages,
            opts
        })
    );
};

export const clearThreadMessages = (parentMessageId: number) => {
    store.dispatch(serverSliceActions.clearThreadMessages(parentMessageId));
};

export const addTypingUser = (
    channelId: number,
    userId: number,
    parentMessageId?: number
) => {
    if (parentMessageId) {
        store.dispatch(
            serverSliceActions.addThreadTypingUser({ parentMessageId, userId })
        );

        const timeoutKey = `thread-${parentMessageId}-${userId}`;

        if (typingTimeouts[timeoutKey]) {
            clearTimeout(typingTimeouts[timeoutKey]);
        }

        typingTimeouts[timeoutKey] = setTimeout(() => {
            removeThreadTypingUser(parentMessageId, userId);

            delete typingTimeouts[timeoutKey];
        }, TYPING_MS + 500);
    } else {
        store.dispatch(serverSliceActions.addTypingUser({ channelId, userId }));

        const timeoutKey = getTypingKey(channelId, userId);

        if (typingTimeouts[timeoutKey]) {
            clearTimeout(typingTimeouts[timeoutKey]);
        }

        typingTimeouts[timeoutKey] = setTimeout(() => {
            removeTypingUser(channelId, userId);

            delete typingTimeouts[timeoutKey];
        }, TYPING_MS + 500);
    }
};

export const removeTypingUser = (channelId: number, userId: number) => {
    store.dispatch(serverSliceActions.removeTypingUser({ channelId, userId }));
};

export const removeThreadTypingUser = (
    parentMessageId: number,
    userId: number
) => {
    store.dispatch(
        serverSliceActions.removeThreadTypingUser({ parentMessageId, userId })
    );
};

export const updateReplyCount = (
    channelId: number,
    messageId: number,
    replyCount: number
) => {
    store.dispatch(
        serverSliceActions.updateReplyCount({
            channelId,
            messageId,
            replyCount
        })
    );
};
