import { useRouletteRoundHistory } from '@/features/server/roulette/hooks';
import { cn } from '@/lib/utils';
import { Zap } from 'lucide-react';
import { memo } from 'react';
import { getNumberColor } from './constants';

const RoundHistory = memo(() => {
    const history = useRouletteRoundHistory();

    if (history.length === 0) return null;

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between px-4">
                <span className="text-xs text-muted-foreground">
                    Last {Math.min(history.length, 20)} results
                </span>
            </div>
            <div className="flex gap-1.5 px-4 overflow-x-auto py-1">
                {history.slice(0, 20).map((round) => {
                    const color = getNumberColor(round.winningNumber);
                    const wasLightning = round.lightningNumbers?.some(
                        (ln) => ln.number === round.winningNumber
                    );
                    return (
                        <span
                            key={round.id}
                            className={cn(
                                'relative text-xs font-bold tabular-nums w-7 h-7 rounded-full flex items-center justify-center shrink-0',
                                color === 'red' && 'bg-red-600 text-white',
                                color === 'black' && 'bg-zinc-800 text-white',
                                color === 'green' && 'bg-green-600 text-white',
                                wasLightning &&
                                    'ring-2 ring-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.5)]'
                            )}
                        >
                            {round.winningNumber}
                            {wasLightning && (
                                <Zap className="absolute -top-1.5 -right-1.5 size-3 fill-yellow-400 text-yellow-400" />
                            )}
                        </span>
                    );
                })}
            </div>
        </div>
    );
});

export { RoundHistory };
