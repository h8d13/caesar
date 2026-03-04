import type { TJoinedSound } from '@sharkord/shared';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Spinner
} from '@sharkord/ui';
import { Plus, Search, Volume2 } from 'lucide-react';
import { memo, useMemo, useState } from 'react';

type TSoundListProps = {
    sounds: TJoinedSound[];
    setSelectedSoundId: (id: number) => void;
    selectedSoundId: number;
    uploadSound: () => void;
    isUploading: boolean;
};

const SoundList = memo(
    ({
        sounds,
        setSelectedSoundId,
        selectedSoundId,
        uploadSound,
        isUploading
    }: TSoundListProps) => {
        const [search, setSearch] = useState('');

        const filteredSounds = useMemo(() => {
            const sorted = sounds.sort((a, b) => b.createdAt - a.createdAt);

            if (!search) return sorted;

            return sorted.filter((sound) =>
                sound.name.toLowerCase().includes(search.toLowerCase())
            );
        }, [sounds, search]);

        return (
            <Card className="w-80 flex-shrink-0">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Sounds</CardTitle>
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={uploadSound}
                            disabled={isUploading}
                        >
                            {isUploading ? (
                                <Spinner size="xs" />
                            ) : (
                                <Plus className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4 p-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search sounds..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                        {filteredSounds.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">
                                {search ? 'No sounds found' : 'No sounds yet'}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-1">
                                {filteredSounds.map((sound) => (
                                    <button
                                        key={sound.id}
                                        onClick={() =>
                                            setSelectedSoundId(sound.id)
                                        }
                                        className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                                            selectedSoundId === sound.id
                                                ? 'bg-accent ring-2 ring-primary'
                                                : ''
                                        }`}
                                    >
                                        <Volume2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                        <span className="truncate">
                                            {sound.name}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    }
);

export { SoundList };
