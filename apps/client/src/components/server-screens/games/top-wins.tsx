import { useCrashTopWins } from '@/features/server/crash/hooks';
import { useRouletteTopWins } from '@/features/server/roulette/hooks';
import { memo, useMemo } from 'react';

const TopWins = memo(() => {
    const rouletteTopWins = useRouletteTopWins();
    const crashTopWins = useCrashTopWins();

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
            }))
        ];
        return all.sort((a, b) => b.profit - a.profit).slice(0, 10);
    }, [rouletteTopWins, crashTopWins]);

    if (combined.length === 0) return null;

    return (
        <div className="flex flex-col gap-1 px-4">
            <div className="text-xs font-medium text-muted-foreground mb-1">
                Top Wins (Session)
            </div>
            <div className="flex flex-col gap-1">
                {combined.map((win, i) => (
                    <div
                        key={i}
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
