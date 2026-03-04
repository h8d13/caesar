import { useAdminSounds } from '@/features/server/admin/hooks';
import { uploadFiles } from '@/helpers/upload-file';
import { useFilePicker } from '@/hooks/use-file-picker';
import { getTRPCClient } from '@/lib/trpc';
import { LoadingCard } from '@sharkord/ui';
import { memo, useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SoundList } from './sound-list';
import { UpdateSound } from './update-sound';
import { UploadSound } from './upload-sound';

const Sounds = memo(() => {
    const { sounds, refetch, loading } = useAdminSounds();
    const openFilePicker = useFilePicker();

    const [selectedSoundId, setSelectedSoundId] = useState<number | undefined>(
        undefined
    );
    const [isUploading, setIsUploading] = useState(false);

    const uploadSound = useCallback(async () => {
        const files = await openFilePicker('audio/*', true);

        if (!files || files.length === 0) return;

        setIsUploading(true);

        const trpc = getTRPCClient();

        try {
            const temporaryFiles = await uploadFiles(files);

            await trpc.sounds.add.mutate(
                temporaryFiles.map((f) => ({
                    name: f.originalName.replace(/\.[^/.]+$/, '').slice(0, 32),
                    fileId: f.id
                }))
            );

            refetch();
            toast.success('Sound uploaded');
        } catch (error) {
            console.error('Error uploading sound:', error);

            toast.error('Failed to upload sound');
        } finally {
            setIsUploading(false);
        }
    }, [openFilePicker, refetch]);

    const selectedSound = useMemo(
        () => sounds.find((s) => s.id === selectedSoundId),
        [sounds, selectedSoundId]
    );

    if (loading) {
        return <LoadingCard className="h-[600px]" />;
    }

    return (
        <div className="flex gap-6">
            <SoundList
                sounds={sounds}
                setSelectedSoundId={(id) => setSelectedSoundId(id)}
                selectedSoundId={selectedSoundId ?? -1}
                uploadSound={uploadSound}
                isUploading={isUploading}
            />

            {selectedSound ? (
                <UpdateSound
                    key={selectedSound.id}
                    selectedSound={selectedSound}
                    setSelectedSoundId={setSelectedSoundId}
                    refetch={refetch}
                />
            ) : (
                <UploadSound
                    uploadSound={uploadSound}
                    isUploading={isUploading}
                />
            )}
        </div>
    );
});

export { Sounds };
