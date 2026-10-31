import { ServerScreen } from '@/components/server-screens/screens';
import { requestConfirmation } from '@/features/dialogs/actions';
import { openServerScreen } from '@/features/server-screens/actions';
import { useChannelById } from '@/features/server/channels/hooks';
import { useCan } from '@/features/server/hooks';
import { getTRPCClient } from '@/lib/trpc';
import { Permission } from '@caesar/shared';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuTrigger
} from '@caesar/ui';
import { memo, useCallback } from 'react';
import { toast } from 'sonner';

type TChannelContextMenuProps = {
    children: React.ReactNode;
    channelId: number;
};

const ChannelContextMenu = memo(
    ({ children, channelId }: TChannelContextMenuProps) => {
        const can = useCan();
        const channel = useChannelById(channelId);

        const onDeleteClick = useCallback(async () => {
            const choice = await requestConfirmation({
                title: 'Delete Channel',
                message:
                    'Are you sure you want to delete this channel? This action cannot be undone.',
                confirmLabel: 'Delete',
                cancelLabel: 'Cancel'
            });

            if (!choice) return;

            const trpc = getTRPCClient();

            try {
                await trpc.channels.delete.mutate({ channelId });
                toast.success('Channel deleted');
            } catch {
                toast.error('Failed to delete channel');
            }
        }, [channelId]);

        const onEditClick = useCallback(() => {
            openServerScreen(ServerScreen.CHANNEL_SETTINGS, { channelId });
        }, [channelId]);

        const canManageChannels = can(Permission.MANAGE_CHANNELS);

        // channel settings also hold the permissions tab, which a user can
        // manage without MANAGE_CHANNELS
        if (!canManageChannels && !can(Permission.MANAGE_CHANNEL_PERMISSIONS)) {
            return children;
        }

        return (
            <ContextMenu>
                <ContextMenuTrigger>{children}</ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuLabel>{channel?.name}</ContextMenuLabel>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={onEditClick}>
                        Edit
                    </ContextMenuItem>
                    {canManageChannels && (
                        <ContextMenuItem
                            variant="destructive"
                            onClick={onDeleteClick}
                        >
                            Delete
                        </ContextMenuItem>
                    )}
                </ContextMenuContent>
            </ContextMenu>
        );
    }
);

export { ChannelContextMenu };
