import {
    fetchRouletteHistory,
    fetchRouletteState
} from '@/features/server/roulette/actions';
import { subscribeToRoulette } from '@/features/server/roulette/subscriptions';
import { memo, useEffect } from 'react';
import { BetControls } from './bet-controls';
import { BettingBoard } from './betting-board';
import { PlayerBets } from './player-bets';
import { RoundHistory } from './round-history';
import { RouletteWheel } from './roulette-wheel';

const RouletteGameContent = memo(() => {
    useEffect(() => {
        fetchRouletteState();
        fetchRouletteHistory();
        const unsubscribe = subscribeToRoulette();
        return unsubscribe;
    }, []);

    return (
        <div className="flex flex-col gap-4 h-full pt-12">
            <RoundHistory />
            <RouletteWheel />
            <BetControls>
                <BettingBoard />
            </BetControls>
            <PlayerBets />
        </div>
    );
});

export { RouletteGameContent };
