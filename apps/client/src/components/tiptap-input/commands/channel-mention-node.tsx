import { ChannelChip } from '@/components/channel-chip';
import { Node } from '@tiptap/core';
import {
    NodeViewWrapper,
    ReactNodeViewRenderer,
    type NodeViewProps
} from '@tiptap/react';
import { memo } from 'react';

const ChannelMentionNodeView = memo(({ node }: NodeViewProps) => (
    <NodeViewWrapper as="span" className="mention-inline">
        <ChannelChip
            channelId={Number(node.attrs.channelId)}
            channelType={node.attrs.channelType}
        />
    </NodeViewWrapper>
));

const ChannelMentionNode = Node.create({
    name: 'channelMention',
    group: 'inline',
    inline: true,
    atom: true,

    addNodeView() {
        return ReactNodeViewRenderer(ChannelMentionNodeView, { as: 'span' });
    },

    addAttributes() {
        return {
            channelId: {
                default: null,
                parseHTML: (el) =>
                    el.getAttribute('data-channel-id')?.trim() || null,
                renderHTML: (attrs) =>
                    attrs.channelId !== null && attrs.channelId !== undefined
                        ? { 'data-channel-id': String(attrs.channelId) }
                        : {}
            },
            channelType: {
                default: null,
                parseHTML: (el) =>
                    el.getAttribute('data-channel-type')?.trim() || null,
                renderHTML: (attrs) =>
                    attrs.channelType
                        ? { 'data-channel-type': String(attrs.channelType) }
                        : {}
            }
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-type="channel-mention"]',
                getAttrs: (dom) => {
                    const el = dom as HTMLElement;
                    const channelId = el
                        .getAttribute('data-channel-id')
                        ?.trim();
                    const channelType = el
                        .getAttribute('data-channel-type')
                        ?.trim();
                    return channelId ? { channelId, channelType } : false;
                }
            }
        ];
    },

    renderHTML({ node }) {
        // Content is a bare "#", never the channel name: the name is NOT
        // serialized into the message, so it can't leak to users who lack
        // access. Each viewer resolves the name from their own channel list at
        // render time. The "#" only keeps the node non-empty (the chip view
        // replaces it entirely, so it's never shown).
        return [
            'span',
            {
                'data-type': 'channel-mention',
                'data-channel-id': String(node.attrs.channelId),
                ...(node.attrs.channelType
                    ? { 'data-channel-type': String(node.attrs.channelType) }
                    : {}),
                class: 'mention'
            },
            '#'
        ];
    }
});

export { ChannelMentionNode };
