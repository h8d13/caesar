import { CrashGameContent } from '@/components/crash-game';
import { RouletteGameContent } from '@/components/roulette-game';
import { cn } from '@/lib/utils';
import { memo, useState } from 'react';
import { ServerScreenLayout } from '../server-screen-layout';
import { BankBalance } from './bank-balance';
import { TopWins } from './top-wins';

type Tab = 'games' | 'history';

type TGamesProps = {
    close: () => void;
};

const Games = memo(({ close }: TGamesProps) => {
    const [tab, setTab] = useState<Tab>('games');

    return (
        <ServerScreenLayout close={close} title="Games">
            <div className="flex flex-col gap-4 h-full">
                <div className="flex items-center gap-4 px-4">
                    <BankBalance />
                    <div className="flex gap-1">
                        <button
                            onClick={() => setTab('games')}
                            className={cn(
                                'text-xs px-3 py-1 rounded-full transition-colors',
                                tab === 'games'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground hover:text-foreground'
                            )}
                        >
                            Games
                        </button>
                        <button
                            onClick={() => setTab('history')}
                            className={cn(
                                'text-xs px-3 py-1 rounded-full transition-colors',
                                tab === 'history'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground hover:text-foreground'
                            )}
                        >
                            History
                        </button>
                    </div>
                </div>
                {tab === 'games' ? (
                    <div className="flex gap-6 flex-1 min-h-0">
                        <div className="w-4/5 min-w-0 overflow-auto">
                            <RouletteGameContent />
                        </div>
                        <div className="w-1/5 min-w-0">
                            <CrashGameContent />
                        </div>
                    </div>
                ) : (
                    <TopWins />
                )}
            </div>
        </ServerScreenLayout>
    );
});

export { Games };
