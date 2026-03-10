import {
    fetchRouletteHistory,
    fetchRouletteState
} from '@/features/server/roulette/actions';
import { subscribeToRoulette } from '@/features/server/roulette/subscriptions';
import { memo, useEffect } from 'react';
import { BetControls } from './bet-controls';
import { BettingBoard } from './betting-board';
import { RoulettePlayerBets } from './player-bets';
import { LightningDisplay, RouletteWheel } from './roulette-wheel';
import { RoundHistory } from './round-history';
import { RoundWinners } from './round-winners';

const RouletteGameContent = memo(() => {
    useEffect(() => {
        fetchRouletteState();
        fetchRouletteHistory();
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
