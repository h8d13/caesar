import {
    useMediaControl,
    type TVolumeKey
} from '@/components/media-provider/media-control-context';
import type { TVoiceUser } from '@/features/server/types';
import { useOwnUserId } from '@/features/server/users/hooks';
import { getRenderedUsername } from '@/helpers/get-rendered-username';
import {
    Button,
    ContextMenu,
    ContextMenuCheckboxItem,
    ContextMenuContent,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuTrigger,
    Slider
} from '@caesar/ui';
import { Volume2, VolumeX } from 'lucide-react';
import { memo } from 'react';

type TVolumeRowProps = {
    volumeKey: TVolumeKey;
};

// Same slider row as the top-bar Controls popover (controllers.tsx).
const VolumeRow = memo(({ volumeKey }: TVolumeRowProps) => {
    const { getVolume, setVolume, toggleMute } = useMediaControl();
    const volume = getVolume(volumeKey);
    const isMuted = volume === 0;

    return (
        <div className="flex items-center gap-2 px-2 py-1.5">
            <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleMute(volumeKey)}
                className="h-6 w-6 p-0"
            >
                {isMuted ? (
                    <VolumeX className="h-4 w-4 text-muted-foreground" />
                ) : (
                    <Volume2 className="h-4 w-4" />
                )}
            </Button>

            <Slider
                value={[volume]}
                onValueChange={(values) => setVolume(volumeKey, values[0] || 0)}
                min={0}
                max={100}
                step={1}
                className="flex-1 cursor-pointer"
            />

            <span className="text-xs text-muted-foreground w-8 text-right">
                {volume}%
            </span>
        </div>
    );
});

type TVoiceUserContextMenuProps = {
    user: TVoiceUser;
    children: React.ReactNode;
};

// Right-click menu on a sidebar voice user, mirroring the per-stream
// controls of the top-bar Controls popover: voice volume, video hide,
// and (when screen sharing) stream volume + stream hide.
const VoiceUserContextMenu = memo(
    ({ user, children }: TVoiceUserContextMenuProps) => {
        const ownUserId = useOwnUserId();
        const {
            getUserVolumeKey,
            getUserScreenVolumeKey,
            getUserVideoKey,
            getUserScreenVideoKey,
            isStreamHidden,
            toggleStreamVisibility
        } = useMediaControl();

        // Own streams have no local consumer to control.
        if (user.id === ownUserId) return <>{children}</>;

        const videoKey = getUserVideoKey(user.id);
        const screenVideoKey = getUserScreenVideoKey(user.id);

        return (
            <ContextMenu>
                <ContextMenuTrigger>{children}</ContextMenuTrigger>
                <ContextMenuContent className="w-64">
                    <ContextMenuLabel>
                        {getRenderedUsername(user, user.id)}
                    </ContextMenuLabel>
                    <ContextMenuSeparator />

                    <VolumeRow volumeKey={getUserVolumeKey(user.id)} />

                    {user.state.webcamEnabled && (
                        <ContextMenuCheckboxItem
                            checked={isStreamHidden(videoKey)}
                            onCheckedChange={() =>
                                toggleStreamVisibility(videoKey)
                            }
                            onSelect={(e) => e.preventDefault()}
                        >
                            Disable video
                        </ContextMenuCheckboxItem>
                    )}

                    {user.state.sharingScreen && (
                        <>
                            <ContextMenuSeparator />
                            <ContextMenuLabel>Stream</ContextMenuLabel>

                            <VolumeRow
                                volumeKey={getUserScreenVolumeKey(user.id)}
                            />

                            <ContextMenuCheckboxItem
                                checked={isStreamHidden(screenVideoKey)}
                                onCheckedChange={() =>
                                    toggleStreamVisibility(screenVideoKey)
                                }
                                onSelect={(e) => e.preventDefault()}
                            >
                                Disable stream
                            </ContextMenuCheckboxItem>
                        </>
                    )}
                </ContextMenuContent>
            </ContextMenu>
        );
    }
);

VoiceUserContextMenu.displayName = 'VoiceUserContextMenu';

export { VoiceUserContextMenu };
