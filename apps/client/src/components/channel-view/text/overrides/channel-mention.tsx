import { ChannelChip } from '@/components/channel-chip';
import { memo } from 'react';

type TChannelMentionOverrideProps = {
    channelId: number;
    channelType?: string;
};

const ChannelMentionOverride = memo(
    ({ channelId, channelType }: TChannelMentionOverrideProps) => (
        <ChannelChip channelId={channelId} channelType={channelType} />
    )
);

ChannelMentionOverride.displayName = 'ChannelMentionOverride';

export { ChannelMentionOverride };
