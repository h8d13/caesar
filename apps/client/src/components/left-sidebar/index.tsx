import { ResizableSidebar } from '@/components/resizable-sidebar';
import {
    setDmsOpen,
} from '@/features/app/actions';
import { useDmsOpen } from '@/features/app/hooks';
import { setSelectedChannelId } from '@/features/server/channels/actions';
import {
    useCan,
    usePublicServerSettings,
    useServerName
} from '@/features/server/hooks';
import { LocalStorageKey } from '@/helpers/storage';
import { cn } from '@/lib/utils';
import { Permission } from '@caesar/shared';
import { memo } from 'react';
import { Categories } from './categories';
import { DirectMessages } from './direct-messages';
import { DmButton } from './direct-messages/dm-button';
import { ServerDropdownMenu } from './server-dropdown';
import { UserControl } from './user-control';
import { VoiceControl } from './voice-control';

const MIN_WIDTH = 200;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 288; // w-72 = 288px

type TLeftSidebarProps = {
    className?: string;
    isOpen?: boolean;
};

const LeftSidebar = memo(({ className, isOpen = true }: TLeftSidebarProps) => {
    const serverName = useServerName();
    const dmsOpen = useDmsOpen();
    const publicSettings = usePublicServerSettings();
    const can = useCan();
    const canUseDms = can(Permission.USE_DMS);

    return (
        <ResizableSidebar
            storageKey={LocalStorageKey.LEFT_SIDEBAR_WIDTH}
            minWidth={MIN_WIDTH}
            maxWidth={MAX_WIDTH}
            defaultWidth={DEFAULT_WIDTH}
            edge="right"
            isOpen={isOpen}
            className={cn('h-full', className)}
        >
            <div className="flex w-full justify-between h-12 items-center border-b border-border px-4">
                <h2
                    className="font-semibold text-foreground noselect truncate cursor-pointer"
                    onClick={() => {
                        // Reset both views if clicked, non selectable.
                        setSelectedChannelId(undefined);
                        setDmsOpen(false);
                    }}
                >
                    {serverName}
                </h2>
                <div>
                    <ServerDropdownMenu />
                </div>
            </div>
            {publicSettings?.directMessagesEnabled && canUseDms && <DmButton />}
            <div className="flex-1 overflow-y-auto">
                {dmsOpen ? <DirectMessages /> : <Categories />}
            </div>
            <VoiceControl />
            <UserControl />
        </ResizableSidebar>
    );
});

export { UserControl } from './user-control';
export { LeftSidebar };
