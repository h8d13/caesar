import { requestConfirmation } from '@/features/dialogs/actions';
import { useChannelById } from '@/features/server/channels/hooks';
import { useOwnUserId, useUserById } from '@/features/server/users/hooks';
import { getTRPCClient } from '@/lib/trpc';
import { getTrpcError } from '@caesar/shared';
import { Tooltip } from '@caesar/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Hash, Lock, LockOpen, Timer, Trash2 } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DmCallButton } from './dm-call-button';
import { PinnedMessagesPopover } from './pinned-messages-popover';

type TWipeConversationButtonProps = {
    channelId: number;
};

const WipeConversationButton = memo(
    ({ channelId }: TWipeConversationButtonProps) => {
        const onClick = useCallback(async () => {
            const confirmed = await requestConfirmation({
                title: 'Delete entire conversation?',
                message:
                    'This deletes every message in this DM for both participants. The other person will also see the conversation cleared. This cannot be undone.',
                confirmLabel: 'Delete all',
                variant: 'danger'
            });

            if (!confirmed) return;

            try {
                await getTRPCClient().dms.wipeConversation.mutate({
                    channelId
                });
            } catch (error) {
                toast.error(
                    getTrpcError(error, 'Could not delete the conversation')
                );
            }
        }, [channelId]);

        return (
            <button
                type="button"
                onClick={onClick}
                title="Delete entire conversation"
                className="p-1.5 rounded-md transition-colors hover:bg-destructive/15 text-muted-foreground hover:text-destructive"
            >
                <Trash2 size={16} />
            </button>
        );
    }
);

const parseDmPeerId = (
    channelName: string | null | undefined,
    ownUserId: number | undefined
): number | undefined => {
    if (!channelName || ownUserId == null) return undefined;
    const match = channelName.match(/^DM - (\d+):(\d+)$/);
    if (!match) return undefined;
    const a = Number(match[1]);
    const b = Number(match[2]);
    if (Number.isNaN(a) || Number.isNaN(b)) return undefined;
    return a === ownUserId ? b : a;
};

// Ephemeral mode is the only state in which a DM is end-to-end encrypted
// (the server requires isEncrypted === ephemeral), so this one value drives
// both the toggle and the encryption indicator. null until the first answer.
const useDmEphemeral = (channelId: number) => {
    const [enabled, setEnabled] = useState<boolean | null>(null);
    const queryClient = useQueryClient();

    // Refresh the cached E2EE context after a toggle. Send does not rely on
    // it: onSend re-checks dms.getEphemeral before every message.
    const invalidateE2eeContext = useCallback(() => {
        void queryClient.invalidateQueries({
            queryKey: ['dms', 'e2eeContext', channelId]
        });
    }, [queryClient, channelId]);

    useEffect(() => {
        let cancelled = false;
        const trpc = getTRPCClient();

        trpc.dms.getEphemeral
            .query({ channelId })
            .then((res) => {
                if (!cancelled) setEnabled(res.ephemeralMs !== null);
            })
            .catch(() => {
                // unknown state: never claim encryption we cannot confirm
                if (!cancelled) setEnabled((prev) => prev ?? false);
            });

        const sub = trpc.dms.onEphemeralUpdate.subscribe(undefined, {
            onData: (data) => {
                if (data.channelId === channelId) {
                    setEnabled(data.ephemeralMs !== null);
                    invalidateE2eeContext();
                }
            }
        });

        return () => {
            cancelled = true;
            sub.unsubscribe();
        };
    }, [channelId, invalidateE2eeContext]);

    const onToggle = useCallback(async () => {
        const trpc = getTRPCClient();
        const previous = enabled;
        const next = !enabled;
        setEnabled(next);

        try {
            await trpc.dms.setEphemeral.mutate({
                channelId,
                enabled: next
            });
            invalidateE2eeContext();
        } catch {
            setEnabled(previous);
            toast.error('Could not update ephemeral mode');
        }
    }, [channelId, enabled, invalidateE2eeContext]);

    return { enabled, onToggle };
};

type TDmEncryptionIndicatorProps = {
    encrypted: boolean;
};

const DmEncryptionIndicator = memo(
    ({ encrypted }: TDmEncryptionIndicatorProps) => {
        const Icon = encrypted ? Lock : LockOpen;
        const label = encrypted ? 'End-to-end encrypted' : 'Not encrypted';
        const details = encrypted
            ? 'End-to-end encrypted: only you and the other participant can read messages sent in this mode. The server operator still sees who sent them, when, and file names and sizes.'
            : 'Not encrypted: the server operator can read this conversation. Turn on ephemeral mode to encrypt new messages end-to-end.';

        return (
            <Tooltip
                content={<span className="block max-w-64">{details}</span>}
            >
                <span
                    tabIndex={0}
                    aria-label={details}
                    className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-xs ${
                        encrypted ? 'text-emerald-500' : 'text-amber-500'
                    }`}
                >
                    <Icon size={14} className="shrink-0" />
                    <span>{label}</span>
                </span>
            </Tooltip>
        );
    }
);

type TDmActionsProps = {
    channelId: number;
};

const DmActions = memo(({ channelId }: TDmActionsProps) => {
    const { enabled, onToggle } = useDmEphemeral(channelId);

    return (
        <div className="flex shrink-0 items-center gap-1">
            {enabled !== null && <DmEncryptionIndicator encrypted={enabled} />}
            <DmCallButton channelId={channelId} />
            <button
                type="button"
                onClick={onToggle}
                title={enabled ? 'Encrypted Temp messages (24h)' : 'Normal DMs'}
                className={`p-1.5 rounded-md transition-colors ${
                    enabled
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : 'hover:bg-muted text-muted-foreground'
                }`}
            >
                <Timer size={16} />
            </button>
            <WipeConversationButton channelId={channelId} />
        </div>
    );
});

type TTextTopbarProps = {
    onScrollToMessage: (messageId: number) => Promise<void>;
    channelId: number;
};

const TextTopbar = memo(
    ({ onScrollToMessage, channelId }: TTextTopbarProps) => {
        const channel = useChannelById(channelId);
        const ownUserId = useOwnUserId();
        const isDm = channel?.isDm;
        const channelName = channel?.name;
        const dmPeerId = useMemo(
            () =>
                isDm && channelName !== undefined
                    ? parseDmPeerId(channelName, ownUserId)
                    : undefined,
            [isDm, channelName, ownUserId]
        );
        const dmPeer = useUserById(dmPeerId ?? -1);

        const info = useMemo(() => {
            if (channel?.isDm) {
                return {
                    name: 'DM',
                    topic: dmPeer?.name
                };
            }

            return {
                name: channel?.name,
                topic: channel?.topic
            };
        }, [channel, dmPeer?.name]);

        return (
            <div className="flex h-12 border-b border-border bg-card w-auto overflow-hidden">
                <div className="flex w-full items-center justify-between px-4">
                    <div className="flex items-baseline gap-2 min-w-0">
                        <Hash
                            className="self-center text-muted-foreground"
                            size={16}
                        />
                        <span className="font-bold max-w-40 leading-none">
                            {info.name || 'No topic'}
                        </span>
                        {info.topic && (
                            <span className="text-xs text-muted-foreground truncate max-w-60 leading-none">
                                {info.topic}
                            </span>
                        )}
                    </div>
                    {channel?.isDm ? (
                        <DmActions channelId={channelId} />
                    ) : (
                        <div className="flex items-center gap-1">
                            <PinnedMessagesPopover
                                onScrollToMessage={onScrollToMessage}
                            />
                        </div>
                    )}
                </div>
            </div>
        );
    }
);

export { TextTopbar };
