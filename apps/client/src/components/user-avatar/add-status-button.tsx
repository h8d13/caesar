import { uploadFile } from '@/helpers/upload-file';
import { useFilePicker } from '@/hooks/use-file-picker';
import { getTRPCClient } from '@/lib/trpc';
import { getTrpcError } from '@caesar/shared';
import { Plus } from 'lucide-react';
import { memo, useCallback } from 'react';
import { toast } from 'sonner';

// The small "+" overlaid on the own avatar: picks one or more images, uploads
// each, then registers each as a 24h status. publishUser then lights the ring.
const AddStatusButton = memo(() => {
    const openFilePicker = useFilePicker();

    const onClick = useCallback(
        async (e: React.MouseEvent) => {
            // avatar sits inside a popover trigger; don't open it on +.
            e.stopPropagation();

            const trpc = getTRPCClient();

            try {
                const files = await openFilePicker('image/*', true);
                if (files.length === 0) return;

                let added = 0;

                for (const file of files) {
                    const temporaryFile = await uploadFile(file);

                    if (!temporaryFile) {
                        toast.error(`Could not upload ${file.name}.`);
                        continue;
                    }

                    await trpc.users.addStatusImage.mutate({
                        fileId: temporaryFile.id
                    });
                    added++;
                }

                if (added > 0) {
                    toast.success(
                        added === 1
                            ? 'Status added!'
                            : `${added} statuses added!`
                    );
                }
            } catch (error) {
                toast.error(getTrpcError(error, 'Could not add status'));
            }
        },
        [openFilePicker]
    );

    return (
        <button
            type="button"
            onClick={onClick}
            title="Add a status"
            className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-white ring-2 ring-card transition-colors hover:bg-green-400"
        >
            <Plus className="h-3 w-3" />
        </button>
    );
});

AddStatusButton.displayName = 'AddStatusButton';

export { AddStatusButton };
