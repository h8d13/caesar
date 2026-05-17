import { EditResourceCard } from '@/components/server-screens/edit-resource-card';
import { requestConfirmation } from '@/features/dialogs/actions';
import { getFileUrl } from '@/helpers/get-file-url';
import { getTRPCClient } from '@/lib/trpc';
import {
    parseTrpcErrors,
    type TJoinedEmoji,
    type TTrpcErrors
} from '@caesar/shared';
import { CardTitle, Input, Label } from '@caesar/ui';
import { filesize } from 'filesize';
import { memo, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Emoji } from './emoji';

type TUpdateEmojiProps = {
    selectedEmoji: TJoinedEmoji;
    setSelectedEmojiId: (id: number | undefined) => void;
    refetch: () => void;
};

const UpdateEmoji = memo(
    ({ selectedEmoji, setSelectedEmojiId, refetch }: TUpdateEmojiProps) => {
        const [name, setName] = useState(selectedEmoji.name);
        const [errors, setErrors] = useState<TTrpcErrors>({});

        const onDeleteEmoji = useCallback(async () => {
            const choice = await requestConfirmation({
                title: 'Delete Emoji',
                message: `Are you sure you want to delete this emoji? This action cannot be undone.`,
                confirmLabel: 'Delete'
            });

            if (!choice) return;

            const trpc = getTRPCClient();

            try {
                await trpc.emojis.delete.mutate({ emojiId: selectedEmoji.id });
                toast.success('Emoji deleted');
                refetch();
                setSelectedEmojiId(undefined);
            } catch {
                toast.error('Failed to delete emoji');
            }
        }, [selectedEmoji.id, refetch, setSelectedEmojiId]);

        const onUpdateEmoji = useCallback(async () => {
            const trpc = getTRPCClient();

            try {
                await trpc.emojis.update.mutate({
                    emojiId: selectedEmoji.id,
                    name
                });
                toast.success('Emoji updated');
                refetch();
            } catch (error) {
                setErrors(parseTrpcErrors(error));
            }
        }, [name, selectedEmoji.id, refetch]);

        const onNameChange = useCallback(
            (e: React.ChangeEvent<HTMLInputElement>) => {
                setName(e.target.value);
                setErrors((prev) => ({ ...prev, name: undefined }));
            },
            []
        );

        return (
            <EditResourceCard
                leftHeader={<CardTitle>Edit Emoji</CardTitle>}
                onDelete={onDeleteEmoji}
                onClose={() => setSelectedEmojiId(undefined)}
                onSave={onUpdateEmoji}
                saveDisabled={selectedEmoji.name === name}
            >
                <div className="flex items-center gap-4 p-4 rounded-lg bg-muted">
                    <Emoji
                        src={getFileUrl(selectedEmoji.file)}
                        name={selectedEmoji.name}
                        className="h-16 w-16"
                    />
                    <div>
                        <div className="font-medium">
                            :{selectedEmoji.name}:
                        </div>
                        <div className="text-sm text-muted-foreground">
                            {filesize(selectedEmoji.file.size)} • Uploaded by{' '}
                            {selectedEmoji.user.name}
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="emoji-name">Name</Label>
                        <Input
                            id="emoji-name"
                            value={name}
                            onChange={onNameChange}
                            placeholder="Enter emoji name (no spaces or special characters)"
                            error={errors.name}
                        />
                        <p className="text-xs text-muted-foreground">
                            This will be used as :{selectedEmoji.name}: in
                            messages
                        </p>
                    </div>
                </div>
            </EditResourceCard>
        );
    }
);

export { UpdateEmoji };
