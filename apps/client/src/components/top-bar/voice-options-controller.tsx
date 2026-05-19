import { useMediaControl } from '@/components/media-provider/media-control-context';
import { useOwnUserId } from '@/features/server/users/hooks';
import {
    setHideNonVideoParticipants,
    setShowUserBannersInVoice
} from '@/features/server/voice/actions';
import {
    useHideNonVideoParticipants,
    useShowUserBannersInVoice
} from '@/features/server/voice/hooks';
import {
    Button,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Switch,
    Tooltip
} from '@caesar/ui';
import { Settings } from 'lucide-react';
import { memo, useCallback } from 'react';

const VoiceOptionsController = memo(() => {
    const hideNonVideoParticipants = useHideNonVideoParticipants();
    const showUserBanners = useShowUserBannersInVoice();
    const ownUserId = useOwnUserId();
    const {
        isStreamHidden,
        getUserVideoKey,
        getUserScreenVideoKey,
        toggleStreamVisibility
    } = useMediaControl();

    // Local-only "hide own stream":
    //   - own user card: stays in the grid, webcam preview is replaced
    //     with the avatar (see useMediaRefs + the isOwn exemption in
    //     voice/index.tsx).
    //   - own screen-share card: removed from the grid entirely. The
    //     card is purely the preview — without it there's nothing
    //     useful to render in a placeholder.
    // Other participants are unaffected on either count.
    const ownVideoKey =
        ownUserId !== undefined ? getUserVideoKey(ownUserId) : null;
    const ownScreenKey =
        ownUserId !== undefined ? getUserScreenVideoKey(ownUserId) : null;
    const videoHidden = ownVideoKey ? isStreamHidden(ownVideoKey) : false;
    const screenHidden = ownScreenKey ? isStreamHidden(ownScreenKey) : false;
    // Switch reflects "both hidden". Toggling forces both keys into the
    // new state so the pair stays in lockstep regardless of any earlier
    // manual per-card eye toggle.
    const hideOwnStream = videoHidden && screenHidden;

    const handleToggleHideNonVideo = useCallback((checked: boolean) => {
        setHideNonVideoParticipants(checked);
    }, []);

    const handleToggleShowUserBanners = useCallback((checked: boolean) => {
        setShowUserBannersInVoice(checked);
    }, []);

    const handleToggleHideOwnStream = useCallback(() => {
        const target = !hideOwnStream;
        if (ownVideoKey && videoHidden !== target) {
            toggleStreamVisibility(ownVideoKey);
        }
        if (ownScreenKey && screenHidden !== target) {
            toggleStreamVisibility(ownScreenKey);
        }
    }, [
        hideOwnStream,
        ownVideoKey,
        ownScreenKey,
        videoHidden,
        screenHidden,
        toggleStreamVisibility
    ]);

    return (
        <Popover>
            <Tooltip content="Options">
                <PopoverTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 transition-all duration-200 ease-in-out"
                    >
                        <Settings className="w-4 h-4" />
                    </Button>
                </PopoverTrigger>
            </Tooltip>
            <PopoverContent align="end" className="w-80">
                <div className="space-y-3">
                    <h4 className="font-medium text-sm cursor-default mb-3">
                        Options
                    </h4>

                    <div className="flex items-center justify-between space-x-3">
                        <span
                            onClick={() =>
                                handleToggleHideNonVideo(
                                    !hideNonVideoParticipants
                                )
                            }
                            className="text-sm text-foreground cursor-pointer select-none flex-1"
                        >
                            Hide non-video participants
                        </span>
                        <Switch
                            id="hide-non-video"
                            checked={hideNonVideoParticipants}
                            onCheckedChange={handleToggleHideNonVideo}
                            data-1p-ignore
                            data-lpignore="true"
                        />
                    </div>

                    <div className="flex items-center justify-between space-x-3">
                        <span
                            onClick={() =>
                                handleToggleShowUserBanners(!showUserBanners)
                            }
                            className="text-sm text-foreground cursor-pointer select-none flex-1"
                        >
                            Display user banners
                        </span>
                        <Switch
                            id="show-user-banners"
                            checked={showUserBanners}
                            onCheckedChange={handleToggleShowUserBanners}
                            data-1p-ignore
                            data-lpignore="true"
                        />
                    </div>

                    <div className="flex items-center justify-between space-x-3">
                        <span
                            onClick={handleToggleHideOwnStream}
                            className="text-sm text-foreground cursor-pointer select-none flex-1"
                        >
                            Hide own stream
                        </span>
                        <Switch
                            id="hide-own-stream"
                            checked={hideOwnStream}
                            onCheckedChange={handleToggleHideOwnStream}
                            disabled={ownUserId === undefined}
                            data-1p-ignore
                            data-lpignore="true"
                        />
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
});

VoiceOptionsController.displayName = 'VoiceOptionsController';

export { VoiceOptionsController };
