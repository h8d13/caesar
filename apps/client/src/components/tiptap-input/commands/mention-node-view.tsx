import { MentionChip } from '@/components/mention-chip';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { memo } from 'react';

const MentionNodeView = memo(({ node }: NodeViewProps) => (
    <NodeViewWrapper as="span" className="mention-inline">
        <MentionChip
            userId={Number(node.attrs.userId)}
            label={node.attrs.label}
        />
    </NodeViewWrapper>
));

export { MentionNodeView };
