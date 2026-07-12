import { SearchDialog } from '@/components/search-dialog';
import {
    useCurrentVoiceChannelId,
    useIsCurrentVoiceChannelSelected
} from '@/features/server/channels/hooks';
import { Button, Tooltip } from '@caesar/ui';
import {
    PanelLeft,
    PanelLeftClose,
    PanelRight,
    PanelRightClose,
    Search
} from 'lucide-react';
import { memo, useState } from 'react';
import { MediaController } from './controllers';
import { VoiceOptionsController } from './voice-options-controller';

type TTopBarProps = {
    onToggleLeftSidebar: () => void;
    isLeftSidebarOpen: boolean;
    onToggleRightSidebar: () => void;
    isRightSidebarOpen: boolean;
};

const TopBar = memo(
    ({
        onToggleLeftSidebar,
        isLeftSidebarOpen,
        onToggleRightSidebar,
        isRightSidebarOpen
    }: TTopBarProps) => {
        const isCurrentVoiceChannelSelected =
            useIsCurrentVoiceChannelSelected();
        const currentVoiceChannelId = useCurrentVoiceChannelId();
        const [isSearchOpen, setIsSearchOpen] = useState(false);
        return (
            <div className="hidden md:flex h-8 w-full bg-card border-b border-border items-center transition-all duration-300 ease-in-out gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onToggleLeftSidebar}
                    className="h-6 px-2 transition-all duration-200 ease-in-out"
                >
                    {isLeftSidebarOpen ? (
                        <Tooltip content="Close Channels Sidebar">
                            <div>
                                <PanelLeftClose className="w-4 h-4 transition-transform duration-200 ease-in-out" />
                            </div>
                        </Tooltip>
                    ) : (
                        <Tooltip content="Open Channels Sidebar">
                            <div>
                                <PanelLeft className="w-4 h-4 transition-transform duration-200 ease-in-out" />
                            </div>
                        </Tooltip>
                    )}
                </Button>
                <div className="flex-1" />
                {isCurrentVoiceChannelSelected && currentVoiceChannelId && (
                    <>
                        <VoiceOptionsController />
                        <MediaController channelId={currentVoiceChannelId} />
                    </>
                )}
                <Tooltip content="Search Messages">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsSearchOpen(true)}
                        className="h-6 px-2 transition-all duration-200 ease-in-out"
                    >
                        <Search className="w-4 h-4" />
                    </Button>
                </Tooltip>
                <SearchDialog
                    open={isSearchOpen}
                    onClose={() => setIsSearchOpen(false)}
                />
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onToggleRightSidebar}
                    className="h-6 px-2 transition-all duration-200 ease-in-out"
                >
                    {isRightSidebarOpen ? (
                        <Tooltip content="Close Members Sidebar">
                            <div>
                                <PanelRightClose className="w-4 h-4 transition-transform duration-200 ease-in-out" />
                            </div>
                        </Tooltip>
                    ) : (
                        <Tooltip content="Open Members Sidebar">
                            <div>
                                <PanelRight className="w-4 h-4 transition-transform duration-200 ease-in-out" />
                            </div>
                        </Tooltip>
                    )}
                </Button>
            </div>
        );
    }
);

export { TopBar };
