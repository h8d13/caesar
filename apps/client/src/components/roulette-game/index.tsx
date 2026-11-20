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
        // min-h-full, not h-full: at a fixed height the betting board (the
        // one child that can shrink, being a scroll container) is squashed
        // flat once bets are listed under it. The column scrolls instead.
        <div className="flex flex-col gap-3 min-h-full pt-6">
            <RoundHistory />
            {/* 1fr | wheel | 1fr: the wheel stays centered whether or not
                the side columns have anything to show */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
                <div className="flex min-w-0 justify-end">
                    <LightningDisplay />
                </div>
                <RouletteWheel />
                <div className="min-w-0">
                    <RoundWinners />
                </div>
            </div>
            <BetControls>
                <BettingBoard />
            </BetControls>
            <RoulettePlayerBets />
        </div>
    );
});

export { RouletteGameContent };
