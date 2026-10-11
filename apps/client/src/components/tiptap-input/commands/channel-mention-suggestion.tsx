import type { TChannel } from '@caesar/shared';
import { computePosition, flip, shift } from '@floating-ui/dom';
import type { Editor } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import { ChannelList, type TChannelListRef } from './channel-list';

const CHANNEL_MENTION_STORAGE_KEY = 'mentionChannels';

type TSuggestionProps = {
    editor: Editor;
    query: string;
    clientRect?: (() => DOMRect | null) | null;
    command: (item: TChannel) => void;
};

const reposition = (component: ReactRenderer | null, clientRect: DOMRect) => {
    if (!component?.element) return;
    component.element.style.position = 'fixed';
    const virtual = { getBoundingClientRect: () => clientRect };
    computePosition(virtual, component.element, {
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

type TChannelStorage = Record<string, { channels?: TChannel[] } | undefined>;

const ChannelMentionSuggestion = {
    items: ({
        editor,
        query
    }: {
        editor: Editor;
        query: string;
    }): TChannel[] => {
        const channels: TChannel[] =
            (editor.storage as unknown as TChannelStorage)[
                CHANNEL_MENTION_STORAGE_KEY
            ]?.channels ?? [];
        if (!query) return channels.slice(0, 10);
        const q = query.toLowerCase();
        return channels
            .filter((c) => c.name.toLowerCase().includes(q))
            .sort((a, b) => {
                const aS = a.name.toLowerCase().startsWith(q);
                const bS = b.name.toLowerCase().startsWith(q);
                if (aS && !bS) return -1;
                if (!aS && bS) return 1;
                return aS && bS ? a.name.length - b.name.length : 0;
            })
            .slice(0, 10);
    },
    allowSpaces: false,
    render: () => {
        let component: ReactRenderer | null = null;
        return {
            onStart(props: TSuggestionProps) {
                const items = ChannelMentionSuggestion.items({
                    editor: props.editor,
                    query: props.query
                });
                const onSelect = (item: TChannel) => {
                    props.command(item);
                    cleanup(component);
                    component = null;
                };
                component = new ReactRenderer(ChannelList, {
                    props: { items, onSelect },
                    editor: props.editor
                });
                document.body.appendChild(component.element);
                const rect = props.clientRect?.();
                if (rect) reposition(component, rect);
            },
            onUpdate(props: TSuggestionProps) {
                const items = ChannelMentionSuggestion.items({
                    editor: props.editor,
                    query: props.query
                });
                component?.updateProps({
                    items,
                    onSelect: (item: TChannel) => {
                        props.command(item);
                        cleanup(component);
                        component = null;
                    }
                });
                const rect = props.clientRect?.();
                if (rect) reposition(component, rect);
            },
            onKeyDown(props: { event: KeyboardEvent }) {
                const ref = component?.ref as TChannelListRef | undefined;
                return ref?.onKeyDown(props.event) ?? false;
            },
            onExit() {
                cleanup(component);
                component = null;
            }
        };
    }
};

export { CHANNEL_MENTION_STORAGE_KEY, ChannelMentionSuggestion };
