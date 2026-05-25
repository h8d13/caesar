import { ChannelChip } from '@/components/channel-chip';
import { memo } from 'react';

type TChannelMentionOverrideProps = {
    channelId: number;
    channelType?: string;
    label?: string;
};

const ChannelMentionOverride = memo(
    ({ channelId, channelType, label }: TChannelMentionOverrideProps) => (
        <ChannelChip
            channelId={channelId}
            channelType={channelType}
            label={label}
        />
    )
);

ChannelMentionOverride.displayName = 'ChannelMentionOverride';

export { ChannelMentionOverride };
