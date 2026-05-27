import { getRenderedUsername } from '@/helpers/get-rendered-username';
import type { TJoinedPublicUser } from '@caesar/shared';
import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import {
    USER_MENTION_STORAGE_KEY,
    UserMentionSuggestion
} from './user-mention-suggestion';

const MentionPluginKey = new PluginKey('mention');

type TMentionOptions = {
    users: TJoinedPublicUser[];
    suggestion: typeof UserMentionSuggestion;
};

const Mention = Extension.create<TMentionOptions>({
    name: USER_MENTION_STORAGE_KEY,
    addOptions() {
        return {
            users: [],
            suggestion: UserMentionSuggestion
        };
    },
    addStorage() {
        return {
            users: this.options.users
        };
    },
    addProseMirrorPlugins() {
        return [
            Suggestion<TJoinedPublicUser, TJoinedPublicUser>({
                editor: this.editor,
                pluginKey: MentionPluginKey,
                char: '@',
                startOfLine: false,
                allowSpaces: this.options.suggestion.allowSpaces,
                items: this.options.suggestion.items,
                render: this.options.suggestion.render,
                command: ({ editor, range, props }) => {
                    const displayName = getRenderedUsername(props, props.id);
                    editor
                        .chain()
                        .focus()
                        .deleteRange(range)
                        .insertContent({
                            type: 'mention',
                            attrs: { userId: props.id, label: displayName }
                        })
                        .run();
                }
            })
        ];
    }
});

export { Mention, MentionPluginKey };
