import { useChannelById } from '@/features/server/channels/hooks';
import { useOwnUserId, useUserById } from '@/features/server/users/hooks';
import { getTRPCClient } from '@/lib/trpc';
import { useQueryClient } from '@tanstack/react-query';
import { Hash, PenTool, Timer } from 'lucide-react';
import { DmCallButton } from './dm-call-button';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PinnedMessagesPopover } from './pinned-messages-popover';

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

type TEphemeralToggleProps = {
    channelId: number;
};

const EphemeralToggle = memo(({ channelId }: TEphemeralToggleProps) => {
    const [enabled, setEnabled] = useState(false);
    const queryClient = useQueryClient();

    // Keep the E2EE context cache (used by compose + render) consistent
    // with the toggle state. Without this, compose would still think the
    // channel is ephemeral after a toggle-off and encrypt regardless,
    // which the server now rejects but produces a worse UX than a fresh
    // local view.
    const invalidateE2eeContext = useCallback(() => {
        queryClient.invalidateQueries({
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
                /* ignore */
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

    return (
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
    );
});

type TTextTopbarProps = {
    onScrollToMessage: (messageId: number) => Promise<void>;
    channelId: number;
    whiteboardOpen: boolean;
    onToggleWhiteboard: () => void;
};

const TextTopbar = memo(
    ({
        onScrollToMessage,
        channelId,
        whiteboardOpen,
        onToggleWhiteboard
    }: TTextTopbarProps) => {
        const channel = useChannelById(channelId);
        const ownUserId = useOwnUserId();
        const dmPeerId = useMemo(
            () =>
                channel?.isDm
                    ? parseDmPeerId(channel.name, ownUserId)
                    : undefined,
            [channel?.isDm, channel?.name, ownUserId]
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
                        <span className="font-bold truncate max-w-40 leading-none">
                            {info.name || 'No topic'}
                        </span>
                        {info.topic && (
                            <span className="text-xs text-muted-foreground truncate max-w-60 leading-none">
                                {info.topic}
                            </span>
                        )}
                    </div>
                    {channel?.isDm ? (
                        <div className="flex items-center gap-1">
                            <DmCallButton channelId={channelId} />
                            <EphemeralToggle channelId={channelId} />
                        </div>
                    ) : (
                        <div className="flex items-center gap-1">
                            <button
                                className={`p-1.5 rounded-md transition-colors ${
                                    whiteboardOpen
                                        ? 'bg-primary text-primary-foreground'
                                        : 'hover:bg-muted text-muted-foreground'
                                }`}
                                onClick={onToggleWhiteboard}
                                title="Toggle whiteboard"
                            >
                                <PenTool size={16} />
                            </button>
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
