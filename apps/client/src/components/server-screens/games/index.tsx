import { CrashGameContent } from '@/components/crash-game';
import { RouletteGameContent } from '@/components/roulette-game';
import { memo } from 'react';
import { ServerScreenLayout } from '../server-screen-layout';
import { BankBalance } from './bank-balance';

type TGamesProps = {
    close: () => void;
};

const Games = memo(({ close }: TGamesProps) => {
    return (
        <ServerScreenLayout close={close} title="Games">
            <div className="flex flex-col gap-4 h-full">
                <BankBalance />
                <div className="flex gap-6 flex-1 min-h-0">
                    <div className="w-4/5 min-w-0 overflow-auto">
                        <RouletteGameContent />
                    </div>
                    <div className="w-1/5 min-w-0">
                        <CrashGameContent />
                    </div>
                </div>
            </div>
        </ServerScreenLayout>
    );
});

export { Games };
