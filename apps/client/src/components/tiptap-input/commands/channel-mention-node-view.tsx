import { ChannelChip } from '@/components/channel-chip';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { memo } from 'react';

const ChannelMentionNodeView = memo(({ node }: NodeViewProps) => (
    <NodeViewWrapper as="span" className="mention-inline">
        <ChannelChip
            channelId={Number(node.attrs.channelId)}
            channelType={node.attrs.channelType}
        />
    </NodeViewWrapper>
));

export { ChannelMentionNodeView };
