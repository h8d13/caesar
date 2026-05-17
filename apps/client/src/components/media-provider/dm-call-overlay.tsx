import { VoiceChannel } from '@/components/channel-view/voice';
import {
    useChannelById,
    useCurrentVoiceChannelId
} from '@/features/server/channels/hooks';
import { LocalStorageKey } from '@/helpers/storage';
import { memo } from 'react';
import { useFloatingCard } from './hooks/use-floating-card';

// Shown whenever currentVoiceChannelId maps to a DM channel.
// VoiceChannel pulls streams from MediaProviderContext so all
// video/screenshare cards render the same as in a regular voice channel.
const DmCallOverlay = memo(() => {
    const currentVoiceChannelId = useCurrentVoiceChannelId();
    const channel = useChannelById(currentVoiceChannelId ?? -1);
    const { cardRef, getStyle, handleMouseDown } = useFloatingCard(
        LocalStorageKey.DM_CALL_OVERLAY_POSITION,
        LocalStorageKey.DM_CALL_OVERLAY_SIZE
    );

    if (!currentVoiceChannelId || !channel?.isDm) return null;

    return (
        <div
            ref={cardRef}
            style={getStyle()}
            className="absolute z-50 rounded-lg overflow-hidden border border-border bg-background shadow-xl flex flex-col"
        >
            <div
                className="h-7 bg-card flex items-center px-2 cursor-move select-none shrink-0 border-b border-border"
                onMouseDown={handleMouseDown}
            >
                <span className="text-xs text-muted-foreground font-medium">
                    DM Call
                </span>
            </div>
            <div className="flex-1 overflow-hidden min-h-0">
                <VoiceChannel channelId={currentVoiceChannelId} />
            </div>
        </div>
    );
});

export { DmCallOverlay };
