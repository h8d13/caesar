import { ownUserSelector } from '@/features/server/selectors';
import type { IRootState } from '@/features/store';
import { getTRPCClient } from '@/lib/trpc';
import { Landmark, User } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

const Balances = memo(() => {
    const [balance, setBalance] = useState<number | null>(null);
    const ownUser = useSelector((state: IRootState) => ownUserSelector(state));
    const userBalance = ownUser?.socialCredit ?? 0;

    const fetchBalance = useCallback(async () => {
        try {
            const trpc = getTRPCClient();
            const result = await trpc.others.getBalances.query();
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
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-muted/50 text-sm">
                <Landmark className="w-4 h-4 text-yellow-500" />
                <span className="text-muted-foreground">Bank</span>
                <span className="font-bold tabular-nums text-yellow-500">
                    {balance.toLocaleString()} SC
                </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-muted/50 text-sm">
                <User className="w-4 h-4 text-green-500" />
                <span className="text-muted-foreground">You</span>
                <span className="font-bold tabular-nums text-green-500">
                    {userBalance.toLocaleString()} SC
                </span>
            </div>
        </div>
    );
});

export { Balances };
