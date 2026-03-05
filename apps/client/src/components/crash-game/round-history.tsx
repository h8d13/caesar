import { useCrashRoundHistory } from '@/features/server/crash/hooks';
import { cn } from '@/lib/utils';
import { memo, useMemo } from 'react';

const RoundHistory = memo(() => {
    const history = useCrashRoundHistory();

    const { best, avg } = useMemo(() => {
        if (history.length === 0) return { best: null, avg: null };
        const points = history.map((r) => r.crashPoint);
        return {
            best: Math.max(...points),
            avg: points.reduce((a, b) => a + b, 0) / points.length
        };
    }, [history]);

    if (history.length === 0) return null;

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between px-4">
                {best !== null && (
                    <span className="text-xs text-muted-foreground">
                        Best:{' '}
                        <span className="text-green-400 font-medium tabular-nums">
                            {best.toFixed(2)}x
                        </span>
                        {' · '}Avg:{' '}
                        <span className="font-medium tabular-nums">
                            {avg!.toFixed(2)}x
                        </span>
                    </span>
                )}
                <span className="text-xs text-muted-foreground">
                    Last {history.length} rounds
                </span>
            </div>
            <div className="flex gap-1.5 px-4 overflow-x-auto py-1">
                {history.slice(0, 20).map((round) => (
                    <span
                        key={round.id}
                        className={cn(
                            'text-xs font-medium tabular-nums px-2 py-0.5 rounded shrink-0',
                            round.crashPoint >= 2
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-red-500/20 text-red-400'
                        )}
                    >
                        {round.crashPoint.toFixed(2)}x
                    </span>
                ))}
            </div>
        </div>
    );
});

export { RoundHistory };
