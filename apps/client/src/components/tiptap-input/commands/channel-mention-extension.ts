import type { TChannel } from '@caesar/shared';
import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import {
    CHANNEL_MENTION_STORAGE_KEY,
    ChannelMentionSuggestion
} from './channel-mention-suggestion';

const ChannelMentionPluginKey = new PluginKey('channelMention');

type TChannelMentionOptions = {
    channels: TChannel[];
    suggestion: typeof ChannelMentionSuggestion;
};

const ChannelMention = Extension.create<TChannelMentionOptions>({
    name: CHANNEL_MENTION_STORAGE_KEY,
    addOptions() {
        return {
            channels: [],
            suggestion: ChannelMentionSuggestion
        };
    },
    addStorage() {
        return {
            channels: this.options.channels
        };
    },
    addProseMirrorPlugins() {
        return [
            Suggestion<TChannel, TChannel>({
                editor: this.editor,
                pluginKey: ChannelMentionPluginKey,
                char: '#',
                startOfLine: false,
                allowSpaces: this.options.suggestion.allowSpaces,
                items: this.options.suggestion.items,
                render: this.options.suggestion.render,
                command: ({ editor, range, props }) => {
                    editor
                        .chain()
                        .focus()
                        .deleteRange(range)
                        .insertContent({
                            type: 'channelMention',
                            attrs: {
                                channelId: props.id,
                                channelType: props.type,
                                label: props.name
                            }
                        })
                        .run();
                }
            })
        ];
    }
});

export { ChannelMention, ChannelMentionPluginKey };
