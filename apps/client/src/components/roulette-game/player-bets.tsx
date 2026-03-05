import { useRouletteBets } from '@/features/server/roulette/hooks';
import { memo } from 'react';

const formatBetType = (betType: string, betValue: number | null): string => {
    if (betType === 'straight') return `#${betValue}`;
    return betType.replace(/_/g, ' ').toUpperCase();
};

const RoulettePlayerBets = memo(() => {
    const bets = useRouletteBets();

    if (bets.length === 0) return null;

    return (
        <div className="flex flex-col gap-1 px-4">
            <div className="text-xs font-medium text-muted-foreground mb-1">
                Bets ({bets.length})
            </div>
            <div className="flex flex-col gap-1 max-h-24 overflow-y-auto">
                {bets.map((bet) => (
                    <div
                        key={bet.betId}
                        className="flex items-center justify-between text-sm py-1 px-2 rounded bg-muted/50"
                    >
                        <span className="truncate mr-2">{bet.userName}</span>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground">
                                {formatBetType(bet.betType, bet.betValue)}
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
    );
});

export { RoulettePlayerBets };
