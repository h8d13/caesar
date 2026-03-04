import { useCrashMultiplier, useCrashPhase } from '@/features/server/crash/hooks';
import { CrashPhase } from '@sharkord/shared/games/crash';
import { cn } from '@/lib/utils';
import { memo, useEffect, useRef, useState } from 'react';

const GROWTH_RATE = 0.06;

const MultiplierDisplay = memo(() => {
  const serverMultiplier = useCrashMultiplier();
  const phase = useCrashPhase();
  const [displayMultiplier, setDisplayMultiplier] = useState(serverMultiplier);
  const rafRef = useRef<number>(0);
  const lastServerUpdate = useRef(Date.now());

  useEffect(() => {
    lastServerUpdate.current = Date.now();
    setDisplayMultiplier(serverMultiplier);
  }, [serverMultiplier]);

  useEffect(() => {
    if (phase !== CrashPhase.FLYING) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const animate = () => {
      const elapsed = (Date.now() - lastServerUpdate.current) / 1000;
      const interpolated =
        Math.floor(serverMultiplier * Math.exp(GROWTH_RATE * elapsed) * 100) /
        100;
      setDisplayMultiplier(interpolated);
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, serverMultiplier]);

  const color =
    phase === CrashPhase.CRASHED
      ? 'text-red-500'
      : phase === CrashPhase.FLYING
        ? displayMultiplier >= 2
          ? 'text-green-400'
          : 'text-yellow-400'
        : 'text-muted-foreground';

  return (
    <div className="flex flex-col items-center justify-center py-8">
      <span className={cn('text-6xl font-bold tabular-nums tracking-tight', color)}>
        {displayMultiplier.toFixed(2)}x
      </span>
      {phase === CrashPhase.CRASHED && (
        <span className="mt-2 text-sm text-red-500 font-medium">CRASHED</span>
      )}
      {phase === CrashPhase.BETTING && (
        <span className="mt-2 text-sm text-muted-foreground">
          Waiting for bets...
        </span>
      )}
    </div>
  );
});

export { MultiplierDisplay };
