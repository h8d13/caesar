import { getRenderedUsername } from '@/helpers/get-rendered-username';
import type { TJoinedPublicUser } from '@caesar/shared';
import { computePosition, flip, shift } from '@floating-ui/dom';
import type { Editor } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import { UserList, type TUserListRef } from './user-list';

const USER_MENTION_STORAGE_KEY = 'mentionUsers';

type TSuggestionProps = {
    editor: Editor;
    query: string;
    clientRect?: (() => DOMRect | null) | null;
    command: (item: TJoinedPublicUser) => void;
};

const reposition = (component: ReactRenderer | null, clientRect: DOMRect) => {
    if (!component?.element) return;
    component.element.style.position = 'fixed';
    const virtual = { getBoundingClientRect: () => clientRect };
    void computePosition(virtual, component.element, {
        placement: 'top-start',
        strategy: 'fixed',
        middleware: [flip(), shift({ padding: 8 })]
    }).then((pos) => {
        if (component?.element)
            Object.assign(component.element.style, {
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                position: pos.strategy === 'fixed' ? 'fixed' : 'absolute',
                zIndex: '300'
            });
    });
};

const cleanup = (component: ReactRenderer | null) => {
    if (component?.element && document.body.contains(component.element))
        document.body.removeChild(component.element);
    component?.destroy();
};

type TMentionStorage = Record<
    string,
    { users?: TJoinedPublicUser[] } | undefined
>;

const UserMentionSuggestion = {
    items: ({
        editor,
        query
    }: {
        editor: Editor;
        query: string;
    }): TJoinedPublicUser[] => {
        const users: TJoinedPublicUser[] =
            (editor.storage as unknown as TMentionStorage)[
                USER_MENTION_STORAGE_KEY
            ]?.users ?? [];
        if (!query) return users.slice(0, 10);
        const q = query.toLowerCase();
        return users
            .filter((u) =>
                getRenderedUsername(u, u.id).toLowerCase().includes(q)
            )
            .sort((a, b) => {
                const aName = getRenderedUsername(a, a.id).toLowerCase();
                const bName = getRenderedUsername(b, b.id).toLowerCase();
                const aS = aName.startsWith(q);
                const bS = bName.startsWith(q);
                if (aS && !bS) return -1;
                if (!aS && bS) return 1;
                return aS && bS ? aName.length - bName.length : 0;
            })
            .slice(0, 10);
    },
    allowSpaces: false,
    render: () => {
        let component: ReactRenderer | null = null;
        return {
            onStart(props: TSuggestionProps) {
                const items = UserMentionSuggestion.items({
                    editor: props.editor,
                    query: props.query
                });
                const onSelect = (item: TJoinedPublicUser) => {
                    props.command(item);
                    cleanup(component);
                    component = null;
                };
                component = new ReactRenderer(UserList, {
                    props: { items, onSelect },
                    editor: props.editor
                });
                document.body.appendChild(component.element);
                const rect = props.clientRect?.();
                if (rect) reposition(component, rect);
            },
            onUpdate(props: TSuggestionProps) {
                const items = UserMentionSuggestion.items({
                    editor: props.editor,
                    query: props.query
                });
                component?.updateProps({
                    items,
                    onSelect: (item: TJoinedPublicUser) => {
                        props.command(item);
                        cleanup(component);
                        component = null;
                    }
                });
                const rect = props.clientRect?.();
                if (rect) reposition(component, rect);
            },
            onKeyDown(props: { event: KeyboardEvent }) {
                const ref = component?.ref as TUserListRef | undefined;
                return ref?.onKeyDown(props.event) ?? false;
            },
            onExit() {
                cleanup(component);
                component = null;
            }
        };
    }
};

export { USER_MENTION_STORAGE_KEY, UserMentionSuggestion };
