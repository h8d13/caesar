import type { TEmojiItem } from '@/components/tiptap-input/helpers';
import { useCustomEmojis } from '@/features/server/emojis/hooks';
import { cn } from '@/lib/utils';
import { Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@caesar/ui';
import { memo, useCallback, useMemo, useState } from 'react';
import { CustomEmojiTab } from './custom-emoji-tab';
import { ALL_EMOJIS, searchEmojis, toTEmojiItem } from './emoji-data';
import { EmojiGrid } from './emoji-grid';
import { GifGrid } from './gif-grid';
import { NativeEmojiTab } from './native-emoji-tab';
import { useRecentEmojis } from './use-recent-emojis';

type TEmojiPickerPanelProps = {
    onEmojiSelect: (emoji: TEmojiItem) => void;
    onGifSelect?: (url: string) => void;
    defaultTab: 'native' | 'custom';
    onClose: () => void;
};

// Popover body, mounted only while open (Radix unmounts closed content), so
// search and tab state start fresh on every open.
const EmojiPickerPanel = memo(
    ({
        onEmojiSelect,
        onGifSelect,
        defaultTab,
        onClose
    }: TEmojiPickerPanelProps) => {
        const [search, setSearch] = useState('');
        const [activeTab, setActiveTab] = useState<string>(defaultTab);
        const customEmojis = useCustomEmojis();
        const { addRecent } = useRecentEmojis();

        const convertedCustomEmojis = useMemo(
            () => customEmojis.map(toTEmojiItem),
            [customEmojis]
        );

        const allEmojis = useMemo(
            () => [...ALL_EMOJIS, ...convertedCustomEmojis],
            [convertedCustomEmojis]
        );

        const isGifTab = !!onGifSelect && activeTab === 'gif';
        const isSearching = !isGifTab && search.trim().length > 0;

        const searchResults = useMemo(
            () => (isSearching ? searchEmojis(allEmojis, search) : []),
            [isSearching, allEmojis, search]
        );

        const handleEmojiSelect = useCallback(
            (emoji: TEmojiItem) => {
                onEmojiSelect(emoji);
                onClose();
            },
            [onEmojiSelect, onClose]
        );

        const handleSearchResultSelect = useCallback(
            (emoji: TEmojiItem) => {
                handleEmojiSelect(emoji);
                requestAnimationFrame(() => addRecent(emoji));
            },
            [handleEmojiSelect, addRecent]
        );

        const handleSearchChange = useCallback(
            (e: React.ChangeEvent<HTMLInputElement>) => {
                setSearch(e.target.value);
            },
            []
        );

        const handleGifSelect = useCallback(
            (url: string) => {
                onGifSelect?.(url);
                onClose();
            },
            [onGifSelect, onClose]
        );

        // Search box is shared between tabs; clear it when hopping so an
        // emoji query doesn't silently drive the GIF search (and back).
        const handleTabChange = useCallback((tab: string) => {
            setActiveTab(tab);
            setSearch('');
        }, []);

        return (
            <div className="h-full flex flex-col">
                <div className="p-3 border-b">
                    <Input
                        placeholder={
                            isGifTab ? 'Search GIFs...' : 'Search all emojis...'
                        }
                        value={search}
                        onChange={handleSearchChange}
                        className="h-9"
                        autoFocus
                    />
                </div>

                {isSearching ? (
                    <div className="flex flex-col flex-1 min-h-0">
                        <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
                            Search results ({searchResults.length})
                        </div>
                        <div className="flex-1 min-h-0">
                            <EmojiGrid
                                emojis={searchResults}
                                onSelect={handleSearchResultSelect}
                            />
                        </div>
                    </div>
                ) : (
                    <Tabs
                        value={activeTab}
                        onValueChange={handleTabChange}
                        className="flex-1 flex flex-col min-h-0"
                    >
                        <TabsList
                            className={cn(
                                'grid w-full rounded-none border-b',
                                onGifSelect ? 'grid-cols-3' : 'grid-cols-2'
                            )}
                        >
                            <TabsTrigger value="native">Emoji</TabsTrigger>
                            <TabsTrigger value="custom">Custom</TabsTrigger>
                            {onGifSelect && (
                                <TabsTrigger value="gif">GIFs</TabsTrigger>
                            )}
                        </TabsList>
                        <TabsContent
                            value="native"
                            className="flex-1 mt-0 min-h-0"
                        >
                            <NativeEmojiTab onEmojiSelect={handleEmojiSelect} />
                        </TabsContent>
                        <TabsContent
                            value="custom"
                            className="flex-1 mt-0 min-h-0"
                        >
                            <CustomEmojiTab
                                customEmojis={customEmojis}
                                onEmojiSelect={handleEmojiSelect}
                            />
                        </TabsContent>
                        {onGifSelect && (
                            <TabsContent
                                value="gif"
                                className="flex-1 mt-0 min-h-0"
                            >
                                <GifGrid
                                    search={search}
                                    onSelect={handleGifSelect}
                                />
                            </TabsContent>
                        )}
                    </Tabs>
                )}
            </div>
        );
    }
);

EmojiPickerPanel.displayName = 'EmojiPickerPanel';

export { EmojiPickerPanel };
