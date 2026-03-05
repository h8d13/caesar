import { cashOut, placeBet } from '@/features/server/crash/actions';
import { useCrashPhase } from '@/features/server/crash/hooks';
import { cn } from '@/lib/utils';
import { CrashPhase } from '@sharkord/shared/games/crash';
import { Button, Input } from '@sharkord/ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const PRESETS = [10, 50, 100, 200, 500];

const BetControls = memo(() => {
    const phase = useCrashPhase();
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [autoBet, setAutoBet] = useState(false);
    const lastBetAmount = useRef<number | null>(null);

    const handlePlaceBet = useCallback(async () => {
        const parsed = parseInt(amount, 10);
        if (isNaN(parsed) || parsed < 1) {
            toast.error('Enter a valid bet amount');
            return;
        }

        setLoading(true);
        try {
            await placeBet(parsed);
            lastBetAmount.current = parsed;
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to place bet');
            setAutoBet(false);
        } finally {
            setLoading(false);
        }
    }, [amount]);

    const handleCashOut = useCallback(async () => {
        setLoading(true);
        try {
            await cashOut();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to cash out');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (
            autoBet &&
            phase === CrashPhase.BETTING &&
            lastBetAmount.current !== null
        ) {
            setAmount(String(lastBetAmount.current));
            const parsed = lastBetAmount.current;

            (async () => {
                setLoading(true);
                try {
                    await placeBet(parsed);
                } catch (e) {
                    toast.error(
                        e instanceof Error
                            ? e.message
                            : 'Auto-bet failed'
                    );
                    setAutoBet(false);
                } finally {
                    setLoading(false);
                }
            })();
        }
    }, [autoBet, phase]);

    return (
        <div className="flex flex-col gap-3 px-4">
            <div className="flex gap-2">
                <Input
                    type="number"
                    placeholder="Bet amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    min={1}
                    max={10000}
                    onEnter={
                        phase === CrashPhase.BETTING
                            ? handlePlaceBet
                            : undefined
                    }
                />
            </div>
            <div className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                    <Button
                        key={preset}
                        variant="outline"
                        size="sm"
                        onClick={() => setAmount(String(preset))}
                    >
                        {preset}
                    </Button>
                ))}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAutoBet((prev) => !prev)}
                    className={cn(
                        autoBet &&
                            'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
                    )}
                >
                    {autoBet ? 'Auto: ON' : 'Auto'}
                </Button>
            </div>
            {phase === CrashPhase.FLYING ? (
                <Button
                    onClick={handleCashOut}
                    disabled={loading}
                    className="bg-green-600 hover:bg-green-700 text-white"
                >
                    Cash Out
                </Button>
            ) : (
                <Button
                    onClick={handlePlaceBet}
                    disabled={phase !== CrashPhase.BETTING || loading}
                >
                    Place Bet
                </Button>
            )}
        </div>
    );
});

export { BetControls };
