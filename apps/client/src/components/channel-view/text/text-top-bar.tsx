import { useChannelById } from '@/features/server/channels/hooks';
import { getTRPCClient } from '@/lib/trpc';
import { Hash, PenTool, Timer } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PinnedMessagesPopover } from './pinned-messages-popover';

type TEphemeralToggleProps = {
    channelId: number;
};

const EphemeralToggle = memo(({ channelId }: TEphemeralToggleProps) => {
    const [enabled, setEnabled] = useState(false);

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
                }
            }
        });

        return () => {
            cancelled = true;
            sub.unsubscribe();
        };
    }, [channelId]);

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
        } catch {
            setEnabled(previous);
            toast.error('Could not update ephemeral mode');
        }
    }, [channelId, enabled]);

    return (
        <button
            type="button"
            onClick={onToggle}
            title={
                enabled
                    ? 'Disappearing messages: on (24h)'
                    : 'Disappearing messages: off'
            }
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

        const info = useMemo(() => {
            if (channel?.isDm) {
                return {
                    name: 'Direct Message',
                    topic: 'Only you and the recipient can see the messages here.'
                };
            }

            return {
                name: channel?.name,
                topic: channel?.topic
            };
        }, [channel]);

        return (
            <div className="flex h-12 border-b border-border bg-card w-auto overflow-hidden">
                <div className="flex w-full items-center justify-between px-4">
                    <div className="flex items-center gap-2 min-w-0">
                        <Hash
                            className="inline-block text-muted-foreground"
                            size={16}
                        />
                        <span className="font-bold truncate max-w-40">
                            {info.name || 'No topic'}
                        </span>
                        {info.topic && (
                            <span className="text-xs text-muted-foreground truncate max-w-60">
                                {info.topic}
                            </span>
                        )}
                    </div>
                    {channel?.isDm ? (
                        <EphemeralToggle channelId={channelId} />
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
