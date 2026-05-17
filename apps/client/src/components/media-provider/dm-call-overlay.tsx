import { VoiceChannel } from '@/components/channel-view/voice';
import { useSelectedDmChannelId } from '@/features/app/hooks';
import {
    useChannelById,
    useCurrentVoiceChannelId
} from '@/features/server/channels/hooks';
import { LocalStorageKey } from '@/helpers/storage';
import { memo } from 'react';
import { useFloatingCard } from './hooks/use-floating-card';

// Floating "picture-in-picture" view of the DM call. Only shown when the
// user has navigated AWAY from the active-call DM; when the DM is being
// viewed, content-wrapper swaps in the full VoiceChannel inline instead.
const DmCallOverlay = memo(() => {
    const currentVoiceChannelId = useCurrentVoiceChannelId();
    const channel = useChannelById(currentVoiceChannelId ?? -1);
    const selectedDmChannelId = useSelectedDmChannelId();
    const { cardRef, getStyle, handleMouseDown, handleResizeMouseDown } =
        useFloatingCard(
            LocalStorageKey.DM_CALL_OVERLAY_POSITION,
            LocalStorageKey.DM_CALL_OVERLAY_SIZE
        );

    if (!currentVoiceChannelId || !channel?.isDm) return null;
    // Active-call DM is currently being viewed full-page: skip overlay.
    if (selectedDmChannelId === currentVoiceChannelId) return null;

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

            {/* Resize handles. Corners (z-30) overlay edges (z-20) so
                diagonal resize wins at overlap zones. Mirrors
                floating-pinned-card. */}
            <div
                className="absolute bottom-0 right-0 left-0 h-1.5 cursor-s-resize z-20"
                onMouseDown={(e) => handleResizeMouseDown(e, 's')}
            />
            <div
                className="absolute top-0 bottom-0 right-0 w-1.5 cursor-e-resize z-20"
                onMouseDown={(e) => handleResizeMouseDown(e, 'e')}
            />
            <div
                className="absolute top-0 bottom-0 left-0 w-1.5 cursor-w-resize z-20"
                onMouseDown={(e) => handleResizeMouseDown(e, 'w')}
            />
            <div
                className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-30"
                onMouseDown={(e) => handleResizeMouseDown(e, 'se')}
            />
            <div
                className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize z-30"
                onMouseDown={(e) => handleResizeMouseDown(e, 'sw')}
            />
        </div>
    );
});

export { DmCallOverlay };
