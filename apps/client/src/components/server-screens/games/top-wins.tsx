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

const fetchGameHistory = (p: number) =>
    getTRPCClient().others.getGameHistory.query({ page: p });

type TGameHistoryPage = Awaited<ReturnType<typeof fetchGameHistory>>;

const TopWins = memo(() => {
    const [items, setItems] = useState<GameHistoryItem[]>([]);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);

    const applyPage = useCallback((result: TGameHistoryPage) => {
        setItems(result.items);
        setHasMore(result.hasMore);
        setPage(result.page);
    }, []);

    // background refresh of the first page; failures keep the last page
    useEffect(() => {
        const load = () =>
            fetchGameHistory(0)
                .then(applyPage)
                .catch(() => {});

        void load();
        const interval = setInterval(load, 15_000);
        return () => clearInterval(interval);
    }, [applyPage]);

    // user paging: buttons stay disabled until the page arrives
    const goTo = useCallback(
        (p: number) => {
            setLoading(true);
            fetchGameHistory(p)
                .then(applyPage)
                .catch(() => {})
                .finally(() => setLoading(false));
        },
        [applyPage]
    );

    const goBack = useCallback(() => {
        goTo(Math.max(0, page - 1));
    }, [page, goTo]);

    const goForward = useCallback(() => {
        goTo(page + 1);
    }, [page, goTo]);

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
