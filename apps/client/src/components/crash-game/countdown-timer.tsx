import {
  useCrashPhase,
  useCrashPhaseDuration,
  useCrashPhaseStartedAt,
} from '@/features/server/crash/hooks';
import { CrashPhase } from '@sharkord/shared/games/crash';
import { memo, useEffect, useState } from 'react';

const CountdownTimer = memo(() => {
  const phase = useCrashPhase();
  const phaseStartedAt = useCrashPhaseStartedAt();
  const phaseDuration = useCrashPhaseDuration();
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!phaseStartedAt || !phaseDuration) {
      setRemaining(null);
      return;
    }

    const update = () => {
      const elapsed = Date.now() - phaseStartedAt;
      const left = Math.max(0, phaseDuration - elapsed);
      setRemaining(left);
    };

    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [phaseStartedAt, phaseDuration]);

  if (remaining === null || phase === CrashPhase.FLYING) return null;

  const seconds = (remaining / 1000).toFixed(1);
  const label = phase === CrashPhase.BETTING ? 'Round starts in' : 'Next round in';

  return (
    <div className="text-center text-sm text-muted-foreground">
      {label} <span className="tabular-nums font-medium">{seconds}s</span>
    </div>
  );
});

export { CountdownTimer };
