import { useCoinflipTopWins } from '@/features/server/coinflip/hooks';
import { useCrashTopWins } from '@/features/server/crash/hooks';
import { useRouletteTopWins } from '@/features/server/roulette/hooks';
import { Button } from '@sharkord/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { memo, useMemo, useState } from 'react';

const PAGE_SIZE = 10;

const TopWins = memo(() => {
    const rouletteTopWins = useRouletteTopWins();
    const crashTopWins = useCrashTopWins();
    const coinflipTopWins = useCoinflipTopWins();
    const [page, setPage] = useState(0);

    const combined = useMemo(() => {
        const all = [
            ...rouletteTopWins.map((w) => ({
                userName: w.userName,
                profit: w.profit,
                game: 'Roulette' as const,
                detail: w.betType.replace(/_/g, ' ')
            })),
            ...crashTopWins.map((w) => ({
                userName: w.userName,
                profit: w.profit,
                game: 'Crash' as const,
                detail: `${w.cashedOutAt.toFixed(2)}x`
            })),
            ...coinflipTopWins.map((w) => ({
                userName: w.winnerName,
                profit: w.profit,
                game: 'Coinflip' as const,
                detail: `vs ${w.loserName}`
            }))
        ];
        return all.sort((a, b) => b.profit - a.profit);
    }, [rouletteTopWins, crashTopWins, coinflipTopWins]);

    const totalPages = Math.max(1, Math.ceil(combined.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages - 1);
    const pageItems = combined.slice(
        safePage * PAGE_SIZE,
        (safePage + 1) * PAGE_SIZE
    );

    if (combined.length === 0) return null;

    return (
        <div className="flex flex-col gap-1 px-4 min-h-0">
            <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium text-muted-foreground">
                    Top Wins (Session) &middot; {combined.length}
                </div>
                {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            disabled={safePage === 0}
                            onClick={() => setPage((p) => p - 1)}
                        >
                            <ChevronLeft className="w-3.5 h-3.5" />
                        </Button>
                        <span className="text-xs tabular-nums text-muted-foreground">
                            {safePage + 1}/{totalPages}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            disabled={safePage >= totalPages - 1}
                            onClick={() => setPage((p) => p + 1)}
                        >
                            <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                )}
            </div>
            <div className="flex flex-col gap-1">
                {pageItems.map((win, i) => (
                    <div
                        key={safePage * PAGE_SIZE + i}
                        className="flex items-center justify-between text-sm py-1 px-2 rounded bg-green-500/10"
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
                            <span className="text-green-400 tabular-nums font-medium">
                                +{win.profit} SC
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
});

export { TopWins };
