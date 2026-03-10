import { fetchCoinflipState } from '@/features/server/coinflip/actions';
import { subscribeToCoinflip } from '@/features/server/coinflip/subscriptions';
import { memo, useEffect } from 'react';
import { ChallengeList } from './challenge-list';
import { CreateChallenge } from './create-challenge';

const CoinflipGameContent = memo(() => {
    useEffect(() => {
        fetchCoinflipState();
        const unsubscribe = subscribeToCoinflip();
        return unsubscribe;
    }, []);

    return (
        <div className="flex flex-col gap-4 h-full pt-4">
            <div className="px-4">
                <div className="text-sm font-medium text-muted-foreground mb-1">
                    Coinflip
                </div>
            </div>
            <CreateChallenge />
            <ChallengeList />
        </div>
    );
});

export { CoinflipGameContent };
