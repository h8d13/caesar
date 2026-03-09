import { addMessages } from '@/features/server/messages/actions';
import { store } from '@/features/store';
import type { TJoinedMessage } from '@sharkord/shared';
import { toast } from 'sonner';
import { fetchRepoInfo } from './git';

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
    },
    {
        name: 'git',
        description: 'Fetch details about a GitHub repo',
        handler: async (args, channelId) => {
            const url = args.trim();

            if (!url) {
                const msg = createLocalMessage(
                    channelId,
                    '<p>Usage: /git &lt;repository-url&gt;</p>'
                );
                addMessages(channelId, [msg]);
                return;
            }

            try {
                const info = await fetchRepoInfo(url);

                let content: string;

                if (info.hasChanges) {
                    content = [
                        `<p><strong>${info.url}</strong></p>`,
                        `<p>HEAD changed: <code>${info.previousHeadSha?.slice(0, 7)}</code> → <code>${info.headSha.slice(0, 7)}</code></p>`,
                        `<p>Branch: ${info.defaultBranch} | ${info.branches.length} branches, ${info.tags.length} tags</p>`
                    ].join('');
                } else {
                    content = [
                        `<p><strong>${info.url}</strong></p>`,
                        `<p>Branch: ${info.defaultBranch} | HEAD: <code>${info.headSha.slice(0, 7)}</code></p>`,
                        `<p>${info.branches.length} branches, ${info.tags.length} tags</p>`
                    ].join('');
                }

                const msg = createLocalMessage(channelId, content);
                addMessages(channelId, [msg]);
            } catch (e) {
                toast.error(
                    `Failed to fetch repo: ${e instanceof Error ? e.message : 'Unknown error'}`
                );
            }
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
