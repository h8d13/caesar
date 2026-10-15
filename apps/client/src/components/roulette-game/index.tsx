import {
    fetchRouletteHistory,
    fetchRouletteState
} from '@/features/server/roulette/actions';
import { subscribeToRoulette } from '@/features/server/roulette/subscriptions';
import { getTrpcError } from '@caesar/shared';
import { memo, useEffect } from 'react';
import { toast } from 'sonner';
import { BetControls } from './bet-controls';
import { BettingBoard } from './betting-board';
import { RoulettePlayerBets } from './player-bets';
import { LightningDisplay, RouletteWheel } from './roulette-wheel';
import { RoundHistory } from './round-history';
import { RoundWinners } from './round-winners';

const RouletteGameContent = memo(() => {
    useEffect(() => {
        const onLoadError = (error: unknown) => {
            toast.error(getTrpcError(error, 'Failed to load roulette'));
        };

        fetchRouletteState().catch(onLoadError);
        fetchRouletteHistory().catch(onLoadError);
        const unsubscribe = subscribeToRoulette();
        return unsubscribe;
    }, []);

    return (
        <div className="flex flex-col gap-3 h-full pt-6">
            <RoundHistory />
            <div className="flex items-center justify-center gap-6">
                <RouletteWheel />
                <LightningDisplay />
            </div>
            <RoundWinners />
            <BetControls>
                <BettingBoard />
            </BetControls>
            <RoulettePlayerBets />
        </div>
    );
});

export { RouletteGameContent };
