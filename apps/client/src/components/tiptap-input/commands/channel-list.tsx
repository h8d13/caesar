import { ChannelType, type TChannel } from '@caesar/shared';
import { Hash, Volume2 } from 'lucide-react';
import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';

type TChannelListProps = {
    items: TChannel[];
    onSelect: (item: TChannel) => void;
};

type TChannelListRef = {
    onKeyDown: (event: KeyboardEvent) => boolean;
};

const ChannelList = forwardRef<TChannelListRef, TChannelListProps>(
    ({ items, onSelect }, ref) => {
        const [selectedIndex, setSelectedIndex] = useState(0);
        // new items start the selection over at the top
        const [prevItems, setPrevItems] = useState(items);

        if (items !== prevItems) {
            setPrevItems(items);
            setSelectedIndex(0);
        }

        const selectItem = useCallback(
            (index: number) => items[index] && onSelect(items[index]),
            [items, onSelect]
        );

        const onKeyDown = useCallback(
            (e: KeyboardEvent): boolean => {
                if (items.length === 0) return false;
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedIndex((i) =>
                        i <= 0 ? items.length - 1 : i - 1
                    );
                    return true;
                }
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedIndex((i) =>
                        i >= items.length - 1 ? 0 : i + 1
                    );
                    return true;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    selectItem(selectedIndex);
                    return true;
                }
                if (e.key === 'Escape') return false;
                return false;
            },
            [items, selectItem, selectedIndex]
        );

        useImperativeHandle(ref, () => ({ onKeyDown }));

        if (items.length === 0) return null;

        return (
            <div
                className="bg-popover text-popover-foreground border rounded-md shadow-md min-w-[16rem] max-w-[22rem] max-h-60 overflow-y-auto p-1 z-50"
                role="listbox"
                aria-label="Mention channel"
            >
                {items.map((item, index) => {
                    const Icon =
                        item.type === ChannelType.VOICE ? Volume2 : Hash;

                    return (
                        <button
                            key={item.id}
                            type="button"
                            role="option"
                            aria-selected={index === selectedIndex}
                            className={`w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex items-center gap-2 cursor-default select-none outline-none transition-colors ${
                                index === selectedIndex
                                    ? 'bg-accent text-accent-foreground'
                                    : ''
                            }`}
                            onClick={() => onSelect(item)}
                        >
                            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="font-medium truncate">
                                {item.name}
                            </span>
                            <span className="ml-auto text-xs text-muted-foreground shrink-0">
                                {item.type === ChannelType.VOICE
                                    ? 'voice'
                                    : 'text'}
                            </span>
                        </button>
                    );
                })}
            </div>
        );
    }
);

ChannelList.displayName = 'ChannelList';

export { ChannelList };
export type { TChannelListRef };
