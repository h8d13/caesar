import { EditResourceCard } from '@/components/server-screens/edit-resource-card';
import { requestConfirmation } from '@/features/dialogs/actions';
import { getFileUrl } from '@/helpers/get-file-url';
import { getTRPCClient } from '@/lib/trpc';
import {
    parseTrpcErrors,
    type TJoinedSound,
    type TTrpcErrors
} from '@caesar/shared';
import { CardTitle, Input, Label } from '@caesar/ui';
import { filesize } from 'filesize';
import { Volume2 } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { toast } from 'sonner';

type TUpdateSoundProps = {
    selectedSound: TJoinedSound;
    setSelectedSoundId: (id: number | undefined) => void;
    refetch: () => void;
};

const UpdateSound = memo(
    ({ selectedSound, setSelectedSoundId, refetch }: TUpdateSoundProps) => {
        const [name, setName] = useState(selectedSound.name);
        const [errors, setErrors] = useState<TTrpcErrors>({});

        const onDeleteSound = useCallback(async () => {
            const choice = await requestConfirmation({
                title: 'Delete Sound',
                message: `Are you sure you want to delete this sound? This action cannot be undone.`,
                confirmLabel: 'Delete'
            });

            if (!choice) return;

            const trpc = getTRPCClient();

            try {
                await trpc.sounds.delete.mutate({ soundId: selectedSound.id });
                toast.success('Sound deleted');
                refetch();
                setSelectedSoundId(undefined);
            } catch {
                toast.error('Failed to delete sound');
            }
        }, [selectedSound.id, refetch, setSelectedSoundId]);

        const onUpdateSound = useCallback(async () => {
            const trpc = getTRPCClient();

            try {
                await trpc.sounds.update.mutate({
                    soundId: selectedSound.id,
                    name
                });
                toast.success('Sound updated');
                refetch();
            } catch (error) {
                setErrors(parseTrpcErrors(error));
            }
        }, [name, selectedSound.id, refetch]);

        const onNameChange = useCallback(
            (e: React.ChangeEvent<HTMLInputElement>) => {
                setName(e.target.value);
                setErrors((prev) => ({ ...prev, name: undefined }));
            },
            []
        );

        return (
            <EditResourceCard
                leftHeader={<CardTitle>Edit Sound</CardTitle>}
                onDelete={onDeleteSound}
                onClose={() => setSelectedSoundId(undefined)}
                onSave={onUpdateSound}
                saveDisabled={selectedSound.name === name}
            >
                <div className="flex items-center gap-4 p-4 rounded-lg bg-muted">
                    <Volume2 className="h-16 w-16 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">
                            {selectedSound.name}
                        </div>
                        <div className="text-sm text-muted-foreground">
                            {filesize(selectedSound.file.size)} • Uploaded by{' '}
                            {selectedSound.user.name}
                        </div>
                    </div>
                </div>

                <div>
                    <audio
                        controls
                        src={getFileUrl(selectedSound.file)}
                        className="w-full"
                    />
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="sound-name">Name</Label>
                        <Input
                            id="sound-name"
                            value={name}
                            onChange={onNameChange}
                            placeholder="Enter sound name"
                            error={errors.name}
                        />
                    </div>
                </div>
            </EditResourceCard>
        );
    }
);

export { UpdateSound };
