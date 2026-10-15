import { UserAvatar } from '@/components/user-avatar';
import { getRenderedUsername } from '@/helpers/get-rendered-username';
import type { TJoinedPublicUser } from '@caesar/shared';
import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';

type TUserListProps = {
    items: TJoinedPublicUser[];
    onSelect: (item: TJoinedPublicUser) => void;
};

type TUserListRef = {
    onKeyDown: (event: KeyboardEvent) => boolean;
};

const UserList = forwardRef<TUserListRef, TUserListProps>(
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
                aria-label="Mention user"
            >
                {items.map((item, index) => (
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
                        <UserAvatar
                            userId={item.id}
                            className="h-6 w-6 shrink-0"
                        />
                        <span className="font-medium truncate">
                            {getRenderedUsername(item, item.id)}
                        </span>
                    </button>
                ))}
            </div>
        );
    }
);

UserList.displayName = 'UserList';

export { UserList };
export type { TUserListRef };
