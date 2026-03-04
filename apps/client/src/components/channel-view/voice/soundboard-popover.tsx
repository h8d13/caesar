import { useSounds } from '@/features/server/sounds/hooks';
import { getTRPCClient } from '@/lib/trpc';
import {
    Button,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Tooltip
} from '@sharkord/ui';
import { Music, Search, Volume2 } from 'lucide-react';
import { memo, useMemo, useState } from 'react';

const SoundboardPopover = memo(() => {
    const sounds = useSounds();
    const [search, setSearch] = useState('');

    const filtered = useMemo(
        () =>
            sounds.filter((s) =>
                s.name.toLowerCase().includes(search.toLowerCase())
            ),
        [sounds, search]
    );

    const playSound = (soundId: number) => {
        const trpc = getTRPCClient();
        trpc.voice.playSoundboard.mutate({ soundId });
    };

    return (
        <Popover>
            <Tooltip content="Soundboard">
                <PopoverTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-md"
                        aria-label="Soundboard"
                    >
                        <Music size={20} />
                    </Button>
                </PopoverTrigger>
            </Tooltip>
            <PopoverContent
                align="center"
                side="top"
                className="w-64 p-2"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-2 px-2 pb-2">
                    <Search size={14} className="text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search sounds..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                </div>
                <div className="max-h-48 overflow-y-auto">
                    {filtered.length === 0 ? (
                        <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                            {sounds.length === 0
                                ? 'No sounds uploaded'
                                : 'No sounds found'}
                        </div>
                    ) : (
                        filtered.map((sound) => (
                            <button
                                key={sound.id}
                                onClick={() => playSound(sound.id)}
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                            >
                                <Volume2
                                    size={14}
                                    className="text-muted-foreground"
                                />
                                <span className="truncate">{sound.name}</span>
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
});

SoundboardPopover.displayName = 'SoundboardPopover';

export { SoundboardPopover };
