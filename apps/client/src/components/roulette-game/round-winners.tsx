import { useRouletteBets, useRoulettePhase } from '@/features/server/roulette/hooks';
import { RoulettePhase } from '@sharkord/shared/games/roulette';
import { memo, useEffect, useMemo, useRef, useState } from 'react';

type WinEntry = {
    userName: string;
    profit: number;
    key: string;
};

const RoundWinners = memo(() => {
    const phase = useRoulettePhase();
    const bets = useRouletteBets();
    const [winners, setWinners] = useState<WinEntry[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);

    const currentWinners = useMemo(() => {
        if (phase !== RoulettePhase.RESULT) return [];
        return bets
            .filter((b) => b.profit !== null && b.profit > 0)
            .sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0))
            .map((b, i) => ({
                userName: b.userName,
                profit: b.profit!,
                key: `${b.betId}-${i}`
            }));
    }, [phase, bets]);

    useEffect(() => {
        if (currentWinners.length > 0) {
            setWinners(currentWinners);
        }
    }, [currentWinners]);

    // Clear winners when betting phase starts
    useEffect(() => {
        if (phase === RoulettePhase.BETTING) {
            const timer = setTimeout(() => setWinners([]), 500);
            return () => clearTimeout(timer);
        }
    }, [phase]);

    if (winners.length === 0) return null;

    return (
        <div
            ref={containerRef}
            className="flex flex-col items-center gap-0.5 overflow-hidden max-h-24 px-4"
        >
            {winners.map((w, i) => (
                <div
                    key={w.key}
                    className="animate-in slide-in-from-bottom fade-in text-sm flex items-center gap-2"
                    style={{
                        animationDelay: `${i * 150}ms`,
                        animationDuration: '400ms',
                        animationFillMode: 'both'
                    }}
                >
                    <span className="text-muted-foreground truncate max-w-32">
                        {w.userName}
                    </span>
                    <span className="text-green-400 font-medium tabular-nums">
                        +{w.profit} SC
                    </span>
                </div>
            ))}
        </div>
    );
});

export { RoundWinners };
