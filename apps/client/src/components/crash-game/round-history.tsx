import { useCrashRoundHistory } from '@/features/server/crash/hooks';
import { cn } from '@/lib/utils';
import { memo } from 'react';

const RoundHistory = memo(() => {
  const history = useCrashRoundHistory();

  if (history.length === 0) return null;

  return (
    <div className="flex gap-1.5 px-4 overflow-x-auto py-2">
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
  );
});

export { RoundHistory };
