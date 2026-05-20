import { UnreadCount } from '@/components/unread-count';
import { UserAvatar } from '@/components/user-avatar';
import { setSelectedDmChannelId } from '@/features/app/actions';
import { useSelectedDmChannelId } from '@/features/app/hooks';
import { useChannels } from '@/features/server/channels/hooks';
import { useUnreadMessagesCount } from '@/features/server/hooks';
import {
    useOwnUserId,
    useUserById,
    useUsers
} from '@/features/server/users/hooks';
import {
    getLocalStorageItemAsJSON,
    LocalStorageKey,
    setLocalStorageItemAsJSON
} from '@/helpers/storage';
import { getTRPCClient } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import {
    DELETED_USER_IDENTITY_AND_NAME,
    type TDirectMessageConversation
} from '@caesar/shared';
import { Spinner } from '@caesar/ui';
import { X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SearchUserDropdown } from './search-user-dropdown';

// Client-only "close conversation". The server keeps the DM channel and
// we just hide the entry from this reopening via SearchUserDropdown un-hides it.
const readHiddenDms = (): number[] =>
    getLocalStorageItemAsJSON<number[]>(LocalStorageKey.HIDDEN_DMS, []) ?? [];

const writeHiddenDms = (ids: number[]) =>
    setLocalStorageItemAsJSON(LocalStorageKey.HIDDEN_DMS, ids);

type TDirectMessageItemProps = {
    dm: TDirectMessageConversation;
    selected: boolean;
    onSelect: () => void;
    onClose: () => void;
};

const DirectMessageItem = memo(
    ({ dm, selected, onSelect, onClose }: TDirectMessageItemProps) => {
        const user = useUserById(dm.userId);
        const unreadCount = useUnreadMessagesCount(dm.channelId);

        const handleClose = useCallback(
            (e: React.MouseEvent) => {
                e.stopPropagation();
                onClose();
            },
            [onClose]
        );

        if (!user) {
            return null;
        }

        return (
            <div
                className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground group',
                    selected && 'bg-accent text-accent-foreground'
                )}
            >
                <button
                    type="button"
                    className="flex flex-1 items-center gap-2 min-w-0"
                    onClick={onSelect}
                >
                    <UserAvatar
                        userId={user.id}
                        className="h-6 w-6"
                        showUserPopover
                    />
                    <span className="truncate flex-1 text-left">
                        {user.name}
                    </span>
                </button>
                <UnreadCount count={unreadCount} />
                <button
                    type="button"
                    onClick={handleClose}
                    className="opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity"
                    title="Close conversation"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
        );
    }
);

const DirectMessages = memo(() => {
    const [loading, setLoading] = useState(true);
    const [conversations, setConversations] = useState<
        TDirectMessageConversation[]
    >([]);
    const [hiddenIds, setHiddenIds] = useState<number[]>(() => readHiddenDms());
    const [query, setQuery] = useState('');
    const users = useUsers();
    const channels = useChannels();
    const ownUserId = useOwnUserId();
    const selectedDmChannelId = useSelectedDmChannelId();

    const fetchConversations = useCallback(async () => {
        const trpc = getTRPCClient();

        setLoading(true);

        try {
            const items = await trpc.dms.get.query();

            setConversations(items);
        } catch {
            toast.error('Failed to load direct messages');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchConversations();
    }, [channels.length, fetchConversations]);

    const visibleConversations = useMemo(() => {
        if (hiddenIds.length === 0) return conversations;
        const hidden = new Set(hiddenIds);
        return conversations.filter((c) => !hidden.has(c.channelId));
    }, [conversations, hiddenIds]);

    // auto-select the most recent visible conversation when none is selected
    // or the previously selected one was hidden/closed.
    useEffect(() => {
        if (loading || visibleConversations.length === 0) return;
        const stillExists = visibleConversations.some(
            (c) => c.channelId === selectedDmChannelId
        );
        if (!stillExists) {
            setSelectedDmChannelId(visibleConversations[0]!.channelId);
        }
    }, [loading, visibleConversations, selectedDmChannelId]);

    // subscribe to new conversations being opened, when a new conversation is opened we refetch the list of conversations
    useEffect(() => {
        const trpc = getTRPCClient();

        const sub = trpc.dms.onConversationOpen.subscribe(undefined, {
            onData: () => fetchConversations()
        });

        return () => sub.unsubscribe();
    }, [fetchConversations]);

    const usersToStartDm = useMemo(() => {
        const directMessageUserIds = new Set(
            visibleConversations.map((dm) => dm.userId)
        );

        return users.filter(
            (user) =>
                user.id !== ownUserId &&
                !user.banned &&
                user.name !== DELETED_USER_IDENTITY_AND_NAME &&
                !directMessageUserIds.has(user.id) &&
                user.name.toLowerCase().includes(query.trim().toLowerCase())
        );
    }, [visibleConversations, ownUserId, query, users]);

    const unhideChannel = useCallback((channelId: number) => {
        setHiddenIds((prev) => {
            if (!prev.includes(channelId)) return prev;
            const next = prev.filter((id) => id !== channelId);
            writeHiddenDms(next);
            return next;
        });
    }, []);

    const onCloseConversation = useCallback((channelId: number) => {
        setHiddenIds((prev) => {
            if (prev.includes(channelId)) return prev;
            const next = [...prev, channelId];
            writeHiddenDms(next);
            return next;
        });
    }, []);

    const onStartDm = useCallback(
        async (userId: number) => {
            const trpc = getTRPCClient();

            try {
                const result = await trpc.dms.open.mutate({ userId });

                // Reopening a previously closed DM un-hides it.
                unhideChannel(result.channelId);
                setSelectedDmChannelId(result.channelId);
                await fetchConversations();
            } catch {
                toast.error('Could not open direct message');
            }
        },
        [fetchConversations, unhideChannel]
    );

    return (
        <div className="flex-1 overflow-y-auto p-2">
            <div className="mb-1 flex items-center justify-between px-2 py-1">
                <span className="text-xs font-semibold text-muted-foreground">
                    Direct Messages
                </span>
                <SearchUserDropdown
                    query={query}
                    setQuery={setQuery}
                    usersToStartDm={usersToStartDm}
                    onStartDm={onStartDm}
                />
            </div>

            {loading ? (
                <div className="flex h-24 items-center justify-center">
                    <Spinner size="sm" />
                </div>
            ) : (
                <div className="space-y-0.5">
                    {visibleConversations.map((dm) => (
                        <DirectMessageItem
                            key={dm.channelId}
                            dm={dm}
                            selected={selectedDmChannelId === dm.channelId}
                            onSelect={() =>
                                setSelectedDmChannelId(dm.channelId)
                            }
                            onClose={() => onCloseConversation(dm.channelId)}
                        />
                    ))}
                    {visibleConversations.length === 0 && (
                        <div className="px-2 py-4 text-xs text-muted-foreground">
                            No direct messages yet
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

export { DirectMessages };
