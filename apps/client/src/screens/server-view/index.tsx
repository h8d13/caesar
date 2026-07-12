import { DmIncomingCall } from '@/components/dm-incoming-call';
import { LeftSidebar } from '@/components/left-sidebar';
import { MediaProvider } from '@/components/media-provider';
import { ModViewSheet } from '@/components/mod-view-sheet';
import { Protect } from '@/components/protect';
import { RightSidebar } from '@/components/right-sidebar';
import { StoryViewer } from '@/components/story-viewer';
import { ThreadSidebar } from '@/components/thread-sidebar';
import { TopBar } from '@/components/top-bar';
import { setDmsOpen } from '@/features/app/actions';
import {
    useDmsOpen,
    useSelectedDmChannelId,
    useThreadSidebar
} from '@/features/app/hooks';
import { setSelectedChannelId } from '@/features/server/channels/actions';
import { useCan, usePublicServerSettings } from '@/features/server/hooks';
import { getLocalStorageItemBool, LocalStorageKey } from '@/helpers/storage';
import { useBirthdayToasts } from '@/hooks/use-birthday-toasts';
import { useIsLgUp } from '@/hooks/use-is-lg-up';
import { useSwipeGestures } from '@/hooks/use-swipe-gestures';
import { cn } from '@/lib/utils';
import { Permission } from '@caesar/shared';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ContentWrapper } from './content-wrapper';
import { PreventBrowser } from './prevent-browser';

const ServerView = memo(() => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isMobileUsersOpen, setIsMobileUsersOpen] = useState(false);
    const [isDesktopLeftSidebarOpen, setIsDesktopLeftSidebarOpen] = useState(
        getLocalStorageItemBool(LocalStorageKey.LEFT_SIDEBAR_STATE, true)
    );
    const [isDesktopRightSidebarOpen, setIsDesktopRightSidebarOpen] = useState(
        getLocalStorageItemBool(LocalStorageKey.RIGHT_SIDEBAR_STATE, true)
    );
    const dmsOpen = useDmsOpen();
    const selectedDmChannelId = useSelectedDmChannelId();
    const publicSettings = usePublicServerSettings();
    const can = useCan();
    const canUseDms = can(Permission.USE_DMS);
    const previousServerChannelIdRef = useRef<number | undefined>(undefined);
    const { isOpen: isThreadSidebarOpen } = useThreadSidebar();
    const isLgUp = useIsLgUp();

    useBirthdayToasts();

    const handleDesktopLeftSidebarToggle = useCallback(() => {
        setIsDesktopLeftSidebarOpen((prev) => !prev);
        localStorage.setItem(
            LocalStorageKey.LEFT_SIDEBAR_STATE,
            !isDesktopLeftSidebarOpen ? 'true' : 'false'
        );
    }, [isDesktopLeftSidebarOpen]);

    const handleDesktopRightSidebarToggle = useCallback(() => {
        // between md and lg the members sidebar only exists as the
        // mobile overlay, so the top-bar button drives that instead.
        if (!isLgUp) {
            setIsMobileUsersOpen((prev) => !prev);
            return;
        }

        setIsDesktopRightSidebarOpen((prev) => !prev);
        localStorage.setItem(
            LocalStorageKey.RIGHT_SIDEBAR_STATE,
            !isDesktopRightSidebarOpen ? 'true' : 'false'
        );
    }, [isLgUp, isDesktopRightSidebarOpen]);

    const handleSwipeRight = useCallback(() => {
        if (isMobileMenuOpen || isMobileUsersOpen) {
            setIsMobileMenuOpen(false);
            setIsMobileUsersOpen(false);
            return;
        }

        setIsMobileMenuOpen(true);
    }, [isMobileMenuOpen, isMobileUsersOpen]);

    const handleSwipeLeft = useCallback(() => {
        if (isMobileMenuOpen || isMobileUsersOpen) {
            setIsMobileMenuOpen(false);
            setIsMobileUsersOpen(false);

            return;
        }

        setIsMobileUsersOpen(true);
    }, [isMobileMenuOpen, isMobileUsersOpen]);

    const swipeHandlers = useSwipeGestures({
        onSwipeRight: handleSwipeRight,
        onSwipeLeft: handleSwipeLeft
    });

    useEffect(() => {
        const dmsBlocked =
            publicSettings?.directMessagesEnabled === false || !canUseDms;

        if (dmsBlocked && dmsOpen) {
            setDmsOpen(false);

            if (previousServerChannelIdRef.current) {
                setSelectedChannelId(previousServerChannelIdRef.current);
            }
        }
    }, [publicSettings?.directMessagesEnabled, canUseDms, dmsOpen]);

    return (
        <MediaProvider>
            <DmIncomingCall />
            <div
                className="flex h-dvh flex-col bg-background text-foreground"
                {...swipeHandlers}
            >
                <TopBar
                    onToggleLeftSidebar={handleDesktopLeftSidebarToggle}
                    isLeftSidebarOpen={isDesktopLeftSidebarOpen}
                    onToggleRightSidebar={handleDesktopRightSidebarToggle}
                    isRightSidebarOpen={
                        isLgUp ? isDesktopRightSidebarOpen : isMobileUsersOpen
                    }
                />
                <div className="relative flex min-h-0 flex-1 overflow-hidden">
                    <PreventBrowser />

                    {isMobileMenuOpen && (
                        <div
                            className="md:hidden fixed inset-0 bg-black/50 z-30"
                            onClick={() => setIsMobileMenuOpen(false)}
                        />
                    )}

                    {isMobileUsersOpen && (
                        <div
                            className="lg:hidden fixed inset-0 bg-black/50 z-30"
                            onClick={() => setIsMobileUsersOpen(false)}
                        />
                    )}

                    <LeftSidebar
                        className={cn(
                            'md:relative md:flex fixed inset-0 left-0 h-full z-40 md:z-0',
                            isMobileMenuOpen
                                ? 'translate-x-0'
                                : '-translate-x-full md:translate-x-0'
                        )}
                        isOpen={isMobileMenuOpen || isDesktopLeftSidebarOpen}
                    />

                    <ContentWrapper
                        isDmMode={dmsOpen}
                        selectedDmChannelId={selectedDmChannelId}
                    />

                    <ThreadSidebar isOpen={isThreadSidebarOpen} />

                    <RightSidebar
                        className={cn(
                            'fixed top-0 bottom-0 right-0 h-full z-40',
                            'lg:relative lg:z-0',
                            isMobileUsersOpen
                                ? 'translate-x-0 lg:translate-x-0'
                                : 'translate-x-full lg:translate-x-0'
                        )}
                        isOpen={isMobileUsersOpen || isDesktopRightSidebarOpen}
                    />

                    <Protect permission={Permission.MANAGE_USERS}>
                        <ModViewSheet />
                    </Protect>

                    <StoryViewer />
                </div>
            </div>
        </MediaProvider>
    );
});

export { ServerView };
