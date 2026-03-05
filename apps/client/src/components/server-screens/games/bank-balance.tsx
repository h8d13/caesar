import { getTRPCClient } from '@/lib/trpc';
import { Landmark } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';

const BankBalance = memo(() => {
    const [balance, setBalance] = useState<number | null>(null);

    const fetchBalance = useCallback(async () => {
        try {
            const trpc = getTRPCClient();
            const result = await trpc.others.getBankBalance.query();
            setBalance(result.balance);
        } catch {
            // silently fail
        }
    }, []);

    useEffect(() => {
        fetchBalance();
        const interval = setInterval(fetchBalance, 10_000);
        return () => clearInterval(interval);
    }, [fetchBalance]);

    if (balance === null) return null;

    return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-muted/50 text-sm">
            <Landmark className="w-4 h-4 text-yellow-500" />
            <span className="text-muted-foreground">Bank</span>
            <span className="font-bold tabular-nums text-yellow-500">
                {balance.toLocaleString()} SC
            </span>
        </div>
    );
});

export { BankBalance };
