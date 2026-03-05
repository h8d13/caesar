import {
    useRouletteBets,
    useRouletteTopWins
} from '@/features/server/roulette/hooks';
import { memo } from 'react';

const formatBetType = (betType: string, betValue: number | null): string => {
    if (betType === 'straight') return `#${betValue}`;
    return betType.replace(/_/g, ' ').toUpperCase();
};

const PlayerBets = memo(() => {
    const bets = useRouletteBets();
    const topWins = useRouletteTopWins();

    return (
        <div className="flex flex-col gap-3 px-4 overflow-y-auto">
            {bets.length === 0 ? (
                <div className="py-3 text-sm text-muted-foreground text-center">
                    No bets this round
                </div>
            ) : (
                <div className="flex flex-col gap-1">
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                        Bets ({bets.length})
                    </div>
                    <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                        {bets.map((bet) => (
                            <div
                                key={bet.betId}
                                className="flex items-center justify-between text-sm py-1 px-2 rounded bg-muted/50"
                            >
                                <span className="truncate mr-2">
                                    {bet.userName}
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-xs text-muted-foreground">
                                        {formatBetType(
                                            bet.betType,
                                            bet.betValue
                                        )}
                                    </span>
                                    <span className="tabular-nums">
                                        {bet.amount} SC
                                    </span>
                                    {bet.profit !== null && bet.profit > 0 && (
                                        <span className="text-green-400 tabular-nums text-xs font-medium">
                                            +{bet.profit}
                                        </span>
                                    )}
                                    {bet.profit !== null && bet.profit < 0 && (
                                        <span className="text-red-500 text-xs font-medium">
                                            Lost
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {topWins.length > 0 && (
                <div className="flex flex-col gap-1">
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                        Top Wins (Session)
                    </div>
                    <div className="flex flex-col gap-1">
                        {topWins.map((win, i) => (
                            <div
                                key={i}
                                className="flex items-center justify-between text-sm py-1 px-2 rounded bg-green-500/10"
                            >
                                <span className="truncate mr-2">
                                    {win.userName}
                                </span>
                                <span className="text-green-400 tabular-nums font-medium shrink-0">
                                    +{win.profit} SC
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
});

export { PlayerBets };
