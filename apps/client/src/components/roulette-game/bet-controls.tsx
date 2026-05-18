import {
    placeRouletteBets,
    removeRouletteBet
} from '@/features/server/roulette/actions';
import {
    useRouletteBets,
    useRoulettePhase,
    useRoulettePhaseDuration,
    useRoulettePhaseStartedAt
} from '@/features/server/roulette/hooks';
import { useOwnUserId } from '@/features/server/users/hooks';
import { cn } from '@/lib/utils';
import {
    type RouletteBetType,
    RoulettePhase
} from '@caesar/shared/games/roulette';
import { Button } from '@caesar/ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChipAmountContext } from './chip-amount-context';

const CHIP_PRESETS = [1, 5, 10, 25, 50, 100];

type SavedBet = {
    betType: RouletteBetType;
    betValue: number | null;
    amount: number;
};

type TPhaseCountdownProps = {
    phaseStartedAt: number | null;
    phaseDuration: number | null;
};

const PhaseCountdown = memo(
    ({ phaseStartedAt, phaseDuration }: TPhaseCountdownProps) => {
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

        if (remaining === null) return null;
        return (
            <span className="text-sm tabular-nums text-muted-foreground">
                {(remaining / 1000).toFixed(1)}s
            </span>
        );
    }
);

const BetControls = memo(({ children }: { children?: React.ReactNode }) => {
    const phase = useRoulettePhase();
    const bets = useRouletteBets();
    const ownUserId = useOwnUserId();
    const phaseStartedAt = useRoulettePhaseStartedAt();
    const phaseDuration = useRoulettePhaseDuration();
    const [selectedChip, setSelectedChip] = useState(10);
    const [autoBet, setAutoBet] = useState(false);
    const lastBets = useRef<SavedBet[]>([]);

    // Save own bets when spinning starts (end of betting phase)
    useEffect(() => {
        if (phase === RoulettePhase.SPINNING && bets.length > 0) {
            const ownBets = bets.filter((b) => b.userId === ownUserId);
            if (ownBets.length > 0) {
                lastBets.current = ownBets.map((b) => ({
                    betType: b.betType,
                    betValue: b.betValue,
                    amount: b.amount
                }));
            }
        }
    }, [phase, bets, ownUserId]);

    // Auto rebet when new betting phase starts (single batch request)
    useEffect(() => {
        if (
            autoBet &&
            phase === RoulettePhase.BETTING &&
            lastBets.current.length > 0
        ) {
            const savedBets = lastBets.current;
            (async () => {
                try {
                    const result = await placeRouletteBets(savedBets);
                    if (result.errors.length > 0) {
                        toast.error(result.errors[0]);
                    }
                } catch (e) {
                    toast.error(
                        e instanceof Error ? e.message : 'Auto-bet failed'
                    );
                    setAutoBet(false);
                }
            })();
        }
    }, [autoBet, phase]);

    const ownBets = bets.filter((b) => b.userId === ownUserId);

    const handleClearBets = useCallback(async () => {
        if (phase !== RoulettePhase.BETTING) return;
        for (const bet of ownBets) {
            try {
                await removeRouletteBet(bet.betId);
            } catch (e) {
                toast.error(
                    e instanceof Error ? e.message : 'Failed to remove bet'
                );
                break;
            }
        }
    }, [phase, ownBets]);

    const phaseLabel =
        phase === RoulettePhase.BETTING
            ? 'Betting'
            : phase === RoulettePhase.SPINNING
              ? 'Spinning'
              : phase === RoulettePhase.RESULT
                ? 'Result'
                : '';

    return (
        <ChipAmountContext.Provider value={selectedChip}>
            <div className="flex flex-col gap-3 px-4">
                {/* Phase + timer */}
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">
                        {phaseLabel}
                    </span>
                    <PhaseCountdown
                        phaseStartedAt={phaseStartedAt}
                        phaseDuration={phaseDuration}
                    />
                </div>

                {/* Chip selector + custom + auto */}
                <div className="flex flex-wrap items-center gap-2">
                    {CHIP_PRESETS.map((chip) => (
                        <Button
                            key={chip}
                            variant={
                                selectedChip === chip ? 'default' : 'outline'
                            }
                            size="sm"
                            onClick={() => setSelectedChip(chip)}
                            className={cn(
                                'min-w-[40px]',
                                selectedChip === chip &&
                                    'bg-yellow-600 hover:bg-yellow-700 text-white'
                            )}
                        >
                            {chip}
                        </Button>
                    ))}
                    <input
                        type="number"
                        min={1}
                        max={10000}
                        value={selectedChip}
                        onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!isNaN(v) && v > 0) setSelectedChip(v);
                        }}
                        className="w-20 h-8 px-2 text-sm rounded border border-input bg-background tabular-nums"
                    />
                    <Button
                        variant={autoBet ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setAutoBet((prev) => !prev)}
                    >
                        {autoBet ? 'Auto •' : 'Auto'}
                    </Button>
                </div>
            </div>
            {children}
            {/* Clear bets */}
            {ownBets.length > 0 && phase === RoulettePhase.BETTING && (
                <div className="px-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearBets}
                    >
                        Clear All Bets ({ownBets.length})
                    </Button>
                </div>
            )}
        </ChipAmountContext.Provider>
    );
});

export { BetControls };
