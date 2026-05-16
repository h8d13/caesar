import { getTRPCClient } from '@/lib/trpc';
import { Button } from '@caesar/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';

type GameHistoryItem = {
    userName: string;
    game: 'Roulette' | 'Crash' | 'Coinflip';
    detail: string;
    profit: number;
    createdAt: number;
};

const PAGE_SIZE = 10;

const TopWins = memo(() => {
    const [items, setItems] = useState<GameHistoryItem[]>([]);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);

    const fetchPage = useCallback(async (p: number) => {
        try {
            setLoading(true);
            const trpc = getTRPCClient();
            const result = await trpc.others.getGameHistory.query({ page: p });
            setItems(result.items);
            setHasMore(result.hasMore);
            setPage(result.page);
        } catch {
            // silently fail
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPage(0);
        const interval = setInterval(() => fetchPage(0), 15_000);
        return () => clearInterval(interval);
    }, [fetchPage]);

    const goBack = useCallback(() => {
        const p = Math.max(0, page - 1);
        fetchPage(p);
    }, [page, fetchPage]);

    const goForward = useCallback(() => {
        fetchPage(page + 1);
    }, [page, fetchPage]);

    if (items.length === 0 && page === 0) return null;

    return (
        <div className="flex flex-col gap-1 px-4 min-h-0">
            <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium text-muted-foreground">
                    Game History
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        disabled={page === 0 || loading}
                        onClick={goBack}
                    >
                        <ChevronLeft className="w-3.5 h-3.5" />
                    </Button>
                    <span className="text-xs tabular-nums text-muted-foreground">
                        {page + 1}
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        disabled={!hasMore || loading}
                        onClick={goForward}
                    >
                        <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>
            <div className="flex flex-col gap-1">
                {items.slice(0, PAGE_SIZE).map((win, i) => (
                    <div
                        key={`${page}-${i}`}
                        className={`flex items-center justify-between text-sm py-1 px-2 rounded ${
                            win.profit > 0 ? 'bg-green-500/10' : 'bg-red-500/10'
                        }`}
                    >
                        <div className="flex items-center gap-2 truncate mr-2">
                            <span className="truncate">{win.userName}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                                {win.game}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground">
                                {win.detail}
                            </span>
                            <span
                                className={`tabular-nums font-medium ${
                                    win.profit > 0
                                        ? 'text-green-400'
                                        : 'text-red-400'
                                }`}
                            >
                                {win.profit > 0 ? '+' : ''}
                                {win.profit} SC
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
});

export { TopWins };
