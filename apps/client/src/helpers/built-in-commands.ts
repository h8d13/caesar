import { addMessages } from '@/features/server/messages/actions';
import { store } from '@/features/store';
import type { TJoinedMessage } from '@caesar/shared';

let localMessageId = -1;

const createLocalMessage = (
    channelId: number,
    content: string
): TJoinedMessage => {
    const state = store.getState();
    const userId = state.server.ownUserId ?? 0;

    return {
        id: localMessageId--,
        content,
        userId,
        channelId,
        parentMessageId: null,
        replyToMessageId: null,
        editable: false,
        metadata: null,
        expiresAt: null,
        createdAt: Date.now(),
        updatedAt: null,
        pinned: false,
        pinnedAt: null,
        pinnedBy: null,
        editedAt: null,
        editedBy: null,
        files: [],
        reactions: [],
        scVotes: []
    };
};

export type TBuiltInCommand = {
    name: string;
    description: string;
    handler: (args: string, channelId: number) => void | Promise<void>;
};

export const BUILT_IN_COMMANDS: TBuiltInCommand[] = [
    {
        name: 'ping',
        description: 'Replies with Pong!',
        handler: (_args, channelId) => {
            const msg = createLocalMessage(channelId, '<p>Pong!</p>');
            addMessages(channelId, [msg]);
        }
    }
];

/**
 * Try to handle a message as a built-in slash command.
 * Returns true if the message was handled as a command, false otherwise.
 */
export const handleBuiltInCommand = (
    html: string,
    channelId: number
): boolean => {
    const text = html.replace(/<[^>]*>/g, '').trim();

    if (!text.startsWith('/')) return false;

    const commandName = text.slice(1).split(/\s/)[0].toLowerCase();
    const command = BUILT_IN_COMMANDS.find((c) => c.name === commandName);

    if (!command) return false;

    const args = text.slice(1 + commandName.length).trim();
    command.handler(args, channelId);
    return true;
};
