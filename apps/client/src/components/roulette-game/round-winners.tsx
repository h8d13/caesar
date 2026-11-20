import {
    useRouletteBets,
    useRoulettePhase
} from '@/features/server/roulette/hooks';
import { RoulettePhase } from '@caesar/shared/games/roulette';
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

    // winners outlive the RESULT phase until the clear below
    if (currentWinners.length > 0 && currentWinners !== winners) {
        setWinners(currentWinners);
    }

    // Clear winners when betting phase starts
    useEffect(() => {
        if (phase === RoulettePhase.BETTING) {
            const timer = setTimeout(() => setWinners([]), 500);
            return () => clearTimeout(timer);
        }
    }, [phase]);

    if (winners.length === 0) return null;

    return (
        // as tall as the wheel: as many columns as the free space takes,
        // and a list longer than that scrolls
        <div
            ref={containerRef}
            className="grid w-full grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] content-start gap-x-4 gap-y-0.5 overflow-y-auto max-h-48"
        >
            {winners.map((w, i) => (
                <div
                    key={w.key}
                    className="animate-in slide-in-from-bottom fade-in text-sm flex min-w-0 items-center gap-2"
                    style={{
                        animationDelay: `${i * 150}ms`,
                        animationDuration: '400ms',
                        animationFillMode: 'both'
                    }}
                >
                    <span className="text-muted-foreground truncate">
                        {w.userName}
                    </span>
                    <span className="shrink-0 text-green-400 font-medium tabular-nums">
                        +{w.profit} SC
                    </span>
                </div>
            ))}
        </div>
    );
});

export { RoundWinners };
