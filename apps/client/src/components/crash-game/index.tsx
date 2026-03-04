import {
    closeCrashGame,
    fetchCrashHistory,
    fetchCrashState
} from '@/features/server/crash/actions';
import { useCrashIsOpen } from '@/features/server/crash/hooks';
import { subscribeToCrash } from '@/features/server/crash/subscriptions';
import { Sheet, SheetContent, SheetTitle } from '@sharkord/ui';
import { memo, useCallback, useEffect } from 'react';
import { BetControls } from './bet-controls';
import { CountdownTimer } from './countdown-timer';
import { MultiplierDisplay } from './multiplier-display';
import { PlayerBetsList } from './player-bets-list';
import { RoundHistory } from './round-history';

const CrashGameContent = memo(() => {
    useEffect(() => {
        fetchCrashState();
        fetchCrashHistory();
        const unsubscribe = subscribeToCrash();
        return unsubscribe;
    }, []);

    return (
        <div className="flex flex-col gap-4 h-full">
            <RoundHistory />
            <MultiplierDisplay />
            <CountdownTimer />
            <BetControls />
            <PlayerBetsList />
        </div>
    );
});

const CrashGameSheet = memo(() => {
    const isOpen = useCrashIsOpen();

    const handleClose = useCallback(() => {
        closeCrashGame();
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                handleClose();
            }
        };

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isOpen, handleClose]);

    return (
        <Sheet defaultOpen={false} open={isOpen}>
            <SheetContent close={handleClose}>
                <SheetTitle className="sr-only">Crash Game</SheetTitle>
                {isOpen && <CrashGameContent />}
            </SheetContent>
        </Sheet>
    );
});

export { CrashGameSheet };
