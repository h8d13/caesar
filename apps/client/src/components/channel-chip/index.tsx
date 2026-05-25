import { useSelectChannel } from '@/components/left-sidebar/hooks';
import { useChannelsMap } from '@/features/server/channels/hooks';
import { useChannelCan } from '@/features/server/hooks';
import { ChannelPermission, ChannelType } from '@caesar/shared';
import { Hash, Volume2 } from 'lucide-react';
import { memo, useCallback } from 'react';

type TChannelChipProps = {
    channelId: number;
    // Type/name captured at insert time. Only used as a fallback label when
    // the channel can't be resolved against the viewer's own channel list.
    channelType?: string;
    label?: string;
};

const ChannelChip = memo(
    ({ channelId, channelType, label }: TChannelChipProps) => {
        const channelsMap = useChannelsMap();
        const can = useChannelCan(channelId);
        const selectChannel = useSelectChannel();

        const channel = channelsMap[channelId];
        // Resolve against the VIEWER's access, not the author's: a link to a
        // channel the reader can't see (or that was deleted) degrades to inert
        // text instead of a working link to somewhere they can't reach.
        const canView = !!channel && can(ChannelPermission.VIEW_CHANNEL);

        const isVoice = (channel?.type ?? channelType) === ChannelType.VOICE;
        const Icon = isVoice ? Volume2 : Hash;
        const name = canView ? channel.name : (label ?? 'unknown');

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
    }
);

ChannelChip.displayName = 'ChannelChip';

export { ChannelChip };
