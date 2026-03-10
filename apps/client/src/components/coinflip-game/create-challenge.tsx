import { createCoinflipChallenge } from '@/features/server/coinflip/actions';
import { cn } from '@/lib/utils';
import { CoinflipSide } from '@sharkord/shared/games/coinflip';
import { Button, Input } from '@sharkord/ui';
import { memo, useCallback, useState } from 'react';
import { toast } from 'sonner';

const AMOUNT_PRESETS = [10, 50, 100, 500, 1000];

const CreateChallenge = memo(() => {
    const [side, setSide] = useState<CoinflipSide>(CoinflipSide.HEADS);
    const [amount, setAmount] = useState('100');
    const [loading, setLoading] = useState(false);

    const handleCreate = useCallback(async () => {
        const parsed = parseInt(amount, 10);
        if (isNaN(parsed) || parsed < 1) {
            toast.error('Enter a valid bet amount');
            return;
        }

        setLoading(true);
        try {
            await createCoinflipChallenge(side, parsed);
        } catch (e) {
            toast.error(
                e instanceof Error ? e.message : 'Failed to create challenge'
            );
        } finally {
            setLoading(false);
        }
    }, [side, amount]);

    return (
        <div className="flex flex-col gap-3 px-4">
            {/* Side selector */}
            <div className="flex gap-2">
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

            {/* Amount input */}
            <Input
                type="number"
                placeholder="Bet amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min={1}
                max={100000}
                onEnter={handleCreate}
            />

            {/* Amount presets */}
            <div className="flex flex-wrap gap-2">
                {AMOUNT_PRESETS.map((preset) => (
                    <Button
                        key={preset}
                        variant="outline"
                        size="sm"
                        onClick={() => setAmount(String(preset))}
                    >
                        {preset}
                    </Button>
                ))}
            </div>

            {/* Create button */}
            <Button onClick={handleCreate} disabled={loading}>
                {loading ? 'Creating...' : 'Challenge'}
            </Button>
        </div>
    );
});

export { CreateChallenge };
