import { createCoinflipChallenge } from '@/features/server/coinflip/actions';
import { cn } from '@/lib/utils';
import { CoinflipSide } from '@sharkord/shared/games/coinflip';
import { Button } from '@sharkord/ui';
import { memo, useCallback, useState } from 'react';
import { toast } from 'sonner';

const AMOUNT_PRESETS = [10, 50, 100, 500, 1000];

const CreateChallenge = memo(() => {
    const [side, setSide] = useState<CoinflipSide>(CoinflipSide.HEADS);
    const [amount, setAmount] = useState(100);
    const [loading, setLoading] = useState(false);

    const handleCreate = useCallback(async () => {
        setLoading(true);
        try {
            await createCoinflipChallenge(side, amount);
        } catch (e) {
            toast.error(
                e instanceof Error ? e.message : 'Failed to create challenge'
            );
        } finally {
            setLoading(false);
        }
    }, [side, amount]);

    return (
        <div className="flex flex-col gap-2 px-4">
            {/* Side selector */}
            <div className="flex gap-1">
                <Button
                    variant={
                        side === CoinflipSide.HEADS ? 'default' : 'outline'
                    }
                    size="sm"
                    onClick={() => setSide(CoinflipSide.HEADS)}
                    className={cn(
                        'flex-1',
                        side === CoinflipSide.HEADS &&
                            'bg-yellow-600 hover:bg-yellow-700 text-white'
                    )}
                >
                    Heads
                </Button>
                <Button
                    variant={
                        side === CoinflipSide.TAILS ? 'default' : 'outline'
                    }
                    size="sm"
                    onClick={() => setSide(CoinflipSide.TAILS)}
                    className={cn(
                        'flex-1',
                        side === CoinflipSide.TAILS &&
                            'bg-yellow-600 hover:bg-yellow-700 text-white'
                    )}
                >
                    Tails
                </Button>
            </div>

            {/* Amount presets + custom */}
            <div className="flex flex-wrap gap-1">
                {AMOUNT_PRESETS.map((preset) => (
                    <Button
                        key={preset}
                        variant={amount === preset ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setAmount(preset)}
                        className="min-w-[40px]"
                    >
                        {preset}
                    </Button>
                ))}
                <input
                    type="number"
                    min={1}
                    max={100000}
                    value={amount}
                    onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v) && v > 0) setAmount(v);
                    }}
                    className="w-20 h-8 px-2 text-sm rounded border border-input bg-background tabular-nums"
                />
            </div>

            {/* Create button */}
            <Button size="sm" onClick={handleCreate} disabled={loading}>
                {loading ? 'Creating...' : `Challenge ${amount} SC`}
            </Button>
        </div>
    );
});

export { CreateChallenge };
