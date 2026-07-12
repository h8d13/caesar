import { setDmsOpen, setSelectedDmChannelId } from '@/features/app/actions';
import { useDmsOpen, useSelectedDmChannelId } from '@/features/app/hooks';
import { setSelectedChannelId } from '@/features/server/channels/actions';
import { useChannelsMap } from '@/features/server/channels/hooks';
import { setPendingScrollTarget } from '@/features/server/messages/pending-scroll';
import { useUsers } from '@/features/server/users/hooks';
import { getTRPCClient } from '@/lib/trpc';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    Input,
    Spinner
} from '@caesar/ui';
import { format } from 'date-fns';
import { Hash, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SearchResult = {
    id: number;
    content: string | null;
    channelId: number;
    userId: number;
    createdAt: number;
    isDm: boolean;
};

type TSearchDialogProps = {
    open: boolean;
    onClose: () => void;
};

// Build an excerpt centered on the first occurrence of `query` in `text`.
// Falls back to a prefix slice when the match is near the start or absent.
const EXCERPT_BEFORE = 50;
const EXCERPT_AFTER = 90;

const buildExcerpt = (text: string, query: string): string => {
    if (!text) return '';

    const idx = text.toLowerCase().indexOf(query.toLowerCase());

    if (idx === -1) {
        return text.length <= EXCERPT_BEFORE + EXCERPT_AFTER
            ? text
            : text.slice(0, EXCERPT_BEFORE + EXCERPT_AFTER) + '...';
    }

    const start = Math.max(0, idx - EXCERPT_BEFORE);
    const end = Math.min(text.length, idx + query.length + EXCERPT_AFTER);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < text.length ? '...' : '';

    return prefix + text.slice(start, end) + suffix;
};

const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 30) return `${days}d ago`;
    return format(timestamp, 'P');
};

const stripHtml = (html: string) =>
    html
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

const SearchDialog = ({ open, onClose }: TSearchDialogProps) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const channelsMap = useChannelsMap();
    const users = useUsers();
    const dmsOpen = useDmsOpen();
    const selectedDmChannelId = useSelectedDmChannelId();

    // When the dialog is opened while viewing a DM, scope to that DM.
    const scopedChannelId =
        dmsOpen && selectedDmChannelId ? selectedDmChannelId : undefined;

    const usersMap = useMemo(() => {
        const map: Record<number, string> = {};
        for (const user of users) {
            map[user.id] = user.name;
        }
        return map;
    }, [users]);

    const doSearch = useCallback(
        async (searchQuery: string) => {
            if (!searchQuery.trim()) {
                setResults([]);
                setSearched(false);
                return;
            }

            setLoading(true);
            setSearched(true);

            try {
                const trpc = getTRPCClient();
                const data = await trpc.messages.search.query({
                    query: searchQuery.trim(),
                    channelId: scopedChannelId
                });
                setResults(data);
            } catch {
                setResults([]);
            } finally {
                setLoading(false);
            }
        },
        [scopedChannelId]
    );

    const onQueryChange = useCallback(
        (value: string) => {
            setQuery(value);

            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }

            debounceRef.current = setTimeout(() => {
                doSearch(value);
            }, 300);
        },
        [doSearch]
    );

    const onResultClick = useCallback(
        (result: SearchResult) => {
            onClose();
            setPendingScrollTarget(result.id);

            if (result.isDm) {
                setDmsOpen(true);
                setSelectedDmChannelId(result.channelId);
            } else {
                setDmsOpen(false);
                setSelectedChannelId(result.channelId);
            }
        },
        [onClose]
    );

    // reset state when dialog closes
    useEffect(() => {
        if (!open) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- reset local form state when the dialog is closed by parent
            setQuery('');
            setResults([]);
            setSearched(false);
            setLoading(false);
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        }
    }, [open]);

    // focus input when dialog opens
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
                <DialogTitle className="sr-only">Search messages</DialogTitle>
                <DialogDescription className="sr-only">
                    Search through channel messages
                </DialogDescription>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                    <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => onQueryChange(e.target.value)}
                        placeholder={
                            scopedChannelId
                                ? 'Search this conversation...'
                                : 'Search messages...'
                        }
                        className="border-0 shadow-none focus-visible:ring-0 px-2 h-9 text-sm flex-1"
                    />
                </div>

                <div className="max-h-80 overflow-y-auto">
                    {loading && (
                        <div className="flex items-center justify-center py-8">
                            <Spinner size="sm" />
                        </div>
                    )}

                    {!loading && searched && results.length === 0 && (
                        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                            No results found
                        </div>
                    )}

                    {!loading &&
                        results.map((result) => (
                            <button
                                key={result.id}
                                type="button"
                                onClick={() => onResultClick(result)}
                                className="w-full text-left px-4 py-2.5 hover:bg-accent/50 transition-colors border-b border-border last:border-b-0"
                            >
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                    <span className="flex items-center gap-0.5">
                                        <Hash className="w-3 h-3" />
                                        {result.isDm
                                            ? (usersMap[result.userId] ?? 'DM')
                                            : (channelsMap[result.channelId]
                                                  ?.name ?? 'unknown')}
                                    </span>
                                    {!result.isDm && (
                                        <span>
                                            {usersMap[result.userId] ??
                                                'Unknown User'}
                                        </span>
                                    )}
                                    <span className="ml-auto">
                                        {formatRelativeTime(result.createdAt)}
                                    </span>
                                </div>
                                <div className="text-sm truncate">
                                    {buildExcerpt(
                                        stripHtml(result.content ?? ''),
                                        query
                                    )}
                                </div>
                            </button>
                        ))}

                    {!loading && !searched && (
                        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                            Type to search messages
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export { SearchDialog };
