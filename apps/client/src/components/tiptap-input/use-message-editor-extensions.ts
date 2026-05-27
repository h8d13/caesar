import { useCustomEmojis } from '@/features/server/emojis/hooks';
import { useAccessibleChannels } from '@/features/server/hooks';
import { BUILT_IN_COMMANDS } from '@/helpers/built-in-commands';
import type { TJoinedPublicUser } from '@caesar/shared';
import type { Extension } from '@tiptap/core';
import Emoji, { gitHubEmojis } from '@tiptap/extension-emoji';
import StarterKit from '@tiptap/starter-kit';
import { useMemo } from 'react';
import { ChannelMention } from './commands/channel-mention-extension';
import { ChannelMentionNode } from './commands/channel-mention-node';
import { ChannelMentionSuggestion } from './commands/channel-mention-suggestion';
import { CommandSuggestion } from './commands/command-suggestion';
import { MarkdownShortcuts } from './commands/markdown-shortcuts';
import { Mention } from './commands/mention-extension';
import { MentionNode } from './commands/mention-node';
import { SlashCommands } from './commands/slash-commands-extension';
import { EmojiSuggestion } from './commands/suggestions';
import { UserMentionSuggestion } from './commands/user-mention-suggestion';

// Single source of truth for the message editor's tiptap extensions, shared
// by the inline composer (TiptapInput) and the full-screen editor so mentions,
// channel mentions, slash commands and emoji behave identically in both.
const useMessageEditorExtensions = (
    users?: TJoinedPublicUser[]
): Extension[] => {
    const customEmojis = useCustomEmojis();
    const channels = useAccessibleChannels();

    return useMemo((): Extension[] => {
        const exts = [
            StarterKit.configure({
                hardBreak: {
                    HTMLAttributes: {
                        class: 'hard-break'
                    }
                }
            }),
            Emoji.configure({
                emojis: [...gitHubEmojis, ...customEmojis],
                enableEmoticons: false,
                suggestion: EmojiSuggestion,
                HTMLAttributes: {
                    class: 'emoji-image'
                }
            }),
            SlashCommands.configure({
                commands: BUILT_IN_COMMANDS,
                suggestion: CommandSuggestion
            }) as Extension,
            MarkdownShortcuts
        ] as Extension[];

        if (users && users.length > 0) {
            exts.push(MentionNode as Extension);
            exts.push(
                Mention.configure({
                    users,
                    suggestion: UserMentionSuggestion
                }) as Extension
            );
        }

        if (channels.length > 0) {
            exts.push(ChannelMentionNode as Extension);
            exts.push(
                ChannelMention.configure({
                    channels,
                    suggestion: ChannelMentionSuggestion
                }) as Extension
            );
        }

        return exts;
    }, [customEmojis, users, channels]);
};

export { useMessageEditorExtensions };
