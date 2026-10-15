import {
    fetchCrashHistory,
    fetchCrashState
} from '@/features/server/crash/actions';
import { subscribeToCrash } from '@/features/server/crash/subscriptions';
import { getTrpcError } from '@caesar/shared';
import { memo, useEffect } from 'react';
import { toast } from 'sonner';
import { BetControls } from './bet-controls';
import { CountdownTimer } from './countdown-timer';
import { MultiplierDisplay } from './multiplier-display';
import { CrashPlayerBets } from './player-bets-list';
import { RoundHistory } from './round-history';

const CrashGameContent = memo(() => {
    useEffect(() => {
        const onLoadError = (error: unknown) => {
            toast.error(getTrpcError(error, 'Failed to load crash game'));
        };

        fetchCrashState().catch(onLoadError);
        fetchCrashHistory().catch(onLoadError);
        const unsubscribe = subscribeToCrash();
        return unsubscribe;
    }, []);

    return (
        <div className="flex flex-col gap-4 h-full pt-6">
            <RoundHistory />
            <MultiplierDisplay />
            <CountdownTimer />
            <BetControls />
            <CrashPlayerBets />
        </div>
    );
});

export { CrashGameContent };
