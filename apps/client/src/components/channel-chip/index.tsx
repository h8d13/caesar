import { useSelectChannel } from '@/components/left-sidebar/hooks';
import { useChannelsMap } from '@/features/server/channels/hooks';
import { useChannelCan } from '@/features/server/hooks';
import { ChannelPermission, ChannelType } from '@caesar/shared';
import { Hash, Volume2 } from 'lucide-react';
import { memo, useCallback } from 'react';

type TChannelChipProps = {
    channelId: number;
    // Channel type travels in the payload (it isn't sensitive) only to pick
    // the right icon when the viewer can't resolve the channel themselves.
    channelType?: string;
};

const ChannelChip = memo(({ channelId, channelType }: TChannelChipProps) => {
    const channelsMap = useChannelsMap();
    const can = useChannelCan(channelId);
    const selectChannel = useSelectChannel();

    const channel = channelsMap[channelId];
    // Resolve the name against the VIEWER's own access, not the author's. The
    // name is never carried in the message, so a reader who can't see the
    // channel (or where it was deleted) gets an inert generic label, never
    // the real name and never a working link.
    const canView = !!channel && can(ChannelPermission.VIEW_CHANNEL);

    const isVoice = (channel?.type ?? channelType) === ChannelType.VOICE;
    const Icon = isVoice ? Volume2 : Hash;
    const name = canView ? channel.name : 'unknown-channel';

    const onClick = useCallback(() => {
        if (!canView) return;
        void selectChannel(channelId);
    }, [canView, selectChannel, channelId]);

    if (!canView) {
        return (
            <span className="mention text-muted-foreground bg-muted/40 rounded px-0.5 inline-flex items-center gap-0.5 align-baseline">
                <Icon className="h-3 w-3 shrink-0" />
                {name}
            </span>
        );
    }

    return (
        <span
            role="link"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            }}
            className="mention text-primary bg-primary/10 rounded px-0.5 cursor-pointer hover:bg-primary/20 inline-flex items-center gap-0.5 align-baseline"
        >
            <Icon className="h-3 w-3 shrink-0" />
            {name}
        </span>
    );
});

ChannelChip.displayName = 'ChannelChip';

export { ChannelChip };
