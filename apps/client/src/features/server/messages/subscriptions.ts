import { logDebug } from '@/helpers/browser-logger';
import { getTRPCClient } from '@/lib/trpc';
import type { TJoinedMessage } from '@caesar/shared';
import {
    addMessages,
    addTypingUser,
    clearChannelMessages,
    deleteMessage,
    updateMessage
} from './actions';

const subscribeToMessages = () => {
    const trpc = getTRPCClient();

    const onMessageSub = trpc.messages.onNew.subscribe(undefined, {
        onData: (message: TJoinedMessage) => {
            logDebug('[EVENTS] messages.onNew', { message });
            addMessages(message.channelId, [message], {}, true);
        },
        onError: (err) => console.error('onMessage subscription error:', err)
    });

    const onMessageUpdateSub = trpc.messages.onUpdate.subscribe(undefined, {
        onData: (message: TJoinedMessage) => {
            logDebug('[EVENTS] messages.onUpdate', { message });
            updateMessage(message.channelId, message);
        },
        onError: (err) =>
            console.error('onMessageUpdate subscription error:', err)
    });

    const onMessageDeleteSub = trpc.messages.onDelete.subscribe(undefined, {
        onData: ({ messageId, channelId }) => {
            logDebug('[EVENTS] messages.onDelete', { messageId, channelId });
            deleteMessage(channelId, messageId);
        },
        onError: (err) =>
            console.error('onMessageDelete subscription error:', err)
    });

    const onDmWipedSub = trpc.dms.onWiped.subscribe(undefined, {
        onData: ({ channelId }: { channelId: number }) => {
            logDebug('[EVENTS] dms.onWiped', { channelId });
            clearChannelMessages(channelId);
        },
        onError: (err) => console.error('onDmWiped subscription error:', err)
    });

    const onMessageTypingSub = trpc.messages.onTyping.subscribe(undefined, {
        onData: ({
            userId,
            channelId
        }: {
            userId: number;
            channelId: number;
        }) => {
            logDebug('[EVENTS] messages.onTyping', { userId, channelId });
            addTypingUser(channelId, userId);
        },
        onError: (err) =>
            console.error('onMessageTyping subscription error:', err)
    });

    return () => {
        onMessageSub.unsubscribe();
        onMessageUpdateSub.unsubscribe();
        onMessageDeleteSub.unsubscribe();
        onDmWipedSub.unsubscribe();
        onMessageTypingSub.unsubscribe();
    };
};

export { subscribeToMessages };
