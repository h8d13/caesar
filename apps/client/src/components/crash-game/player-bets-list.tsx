import { useCrashBets } from '@/features/server/crash/hooks';
import { memo } from 'react';

const PlayerBetsList = memo(() => {
  const bets = useCrashBets();

  if (bets.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-muted-foreground text-center">
        No bets this round
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-4">
      <div className="text-xs font-medium text-muted-foreground mb-1">
        Players ({bets.length})
      </div>
      <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
        {bets.map((bet) => (
          <div
            key={bet.userId}
            className="flex items-center justify-between text-sm py-1 px-2 rounded bg-muted/50"
          >
            <span className="truncate mr-2">{bet.userName}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="tabular-nums">{bet.amount} SC</span>
              {bet.cashedOutAt !== null && (
                <span className="text-green-400 tabular-nums text-xs font-medium">
                  {bet.cashedOutAt.toFixed(2)}x
                </span>
              )}
              {bet.cashedOutAt === null && bet.profit !== null && (
                <span className="text-red-500 text-xs font-medium">Bust</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export { PlayerBetsList };
