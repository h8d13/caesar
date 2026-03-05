import {
    fetchCrashHistory,
    fetchCrashState
} from '@/features/server/crash/actions';
import { subscribeToCrash } from '@/features/server/crash/subscriptions';
import { memo, useEffect } from 'react';
import { BetControls } from './bet-controls';
import { CountdownTimer } from './countdown-timer';
import { MultiplierDisplay } from './multiplier-display';
import { CrashPlayerBets } from './player-bets-list';
import { RoundHistory } from './round-history';

const CrashGameContent = memo(() => {
    useEffect(() => {
        fetchCrashState();
        fetchCrashHistory();
        const unsubscribe = subscribeToCrash();
        return unsubscribe;
    }, []);

    return (
        <div className="flex flex-col gap-4 h-full pt-12">
            <RoundHistory />
            <MultiplierDisplay />
            <CountdownTimer />
            <BetControls />
            <CrashPlayerBets />
        </div>
    );
});

export { CrashGameContent };
