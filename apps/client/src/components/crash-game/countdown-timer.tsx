import {
    useCrashPhase,
    useCrashPhaseDuration,
    useCrashPhaseStartedAt
} from '@/features/server/crash/hooks';
import { useNow } from '@/hooks/use-now';
import { CrashPhase } from '@caesar/shared/games/crash';
import { memo } from 'react';

const CountdownTimer = memo(() => {
    const phase = useCrashPhase();
    const phaseStartedAt = useCrashPhaseStartedAt();
    const phaseDuration = useCrashPhaseDuration();
    const now = useNow(100);
    const remaining =
        phaseStartedAt && phaseDuration
            ? Math.max(0, phaseDuration - (now - phaseStartedAt))
            : null;

    if (remaining === null || phase === CrashPhase.FLYING) {
        return <div className="text-center text-sm invisible">&nbsp;</div>;
    }

    const seconds = (remaining / 1000).toFixed(1);
    const label =
        phase === CrashPhase.BETTING ? 'Round starts in' : 'Next round in';

    return (
        <div className="text-center text-sm text-muted-foreground">
            {label} <span className="tabular-nums font-medium">{seconds}s</span>
        </div>
    );
});

export { CountdownTimer };
