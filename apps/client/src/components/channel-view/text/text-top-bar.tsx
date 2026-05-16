import { useChannelById } from '@/features/server/channels/hooks';
import { getTRPCClient } from '@/lib/trpc';
import { Popover, PopoverContent, PopoverTrigger } from '@sharkord/ui';
import { Check, Hash, PenTool, Timer } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PinnedMessagesPopover } from './pinned-messages-popover';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const EPHEMERAL_OPTIONS: { label: string; value: number | null }[] = [
    { label: 'Off', value: null },
    { label: '1 hour', value: HOUR },
    { label: '24 hours', value: DAY },
    { label: '7 days', value: 7 * DAY }
];

const formatEphemeralLabel = (ms: number | null): string => {
    if (!ms) return 'Off';
    if (ms < DAY) return `${Math.round(ms / HOUR)}h`;
    return `${Math.round(ms / DAY)}d`;
};

type TEphemeralSelectorProps = {
    channelId: number;
};

const EphemeralSelector = memo(({ channelId }: TEphemeralSelectorProps) => {
    const [ephemeralMs, setEphemeralMs] = useState<number | null>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const trpc = getTRPCClient();

        trpc.dms.getEphemeral
            .query({ channelId })
            .then((res) => {
                if (!cancelled) setEphemeralMs(res.ephemeralMs);
            })
            .catch(() => {
                /* ignore */
            });

        const sub = trpc.dms.onEphemeralUpdate.subscribe(undefined, {
            onData: (data) => {
                if (data.channelId === channelId) {
                    setEphemeralMs(data.ephemeralMs);
                }
            }
        });

        return () => {
            cancelled = true;
            sub.unsubscribe();
        };
    }, [channelId]);

    const onSelect = useCallback(
        async (value: number | null) => {
            const trpc = getTRPCClient();
            const previous = ephemeralMs;
            setEphemeralMs(value);
            setOpen(false);

            try {
                await trpc.dms.setEphemeral.mutate({
                    channelId,
                    ephemeralMs: value
                });
            } catch {
                setEphemeralMs(previous);
                toast.error('Could not update ephemeral mode');
            }
        },
        [channelId, ephemeralMs]
    );

    const active = ephemeralMs !== null;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    title="Disappearing messages"
                    className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors ${
                        active
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted text-muted-foreground'
                    }`}
                >
                    <Timer size={14} />
                    <span>{formatEphemeralLabel(ephemeralMs)}</span>
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-1">
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    Disappearing messages
                </div>
                {EPHEMERAL_OPTIONS.map((opt) => {
                    const selected = opt.value === ephemeralMs;
                    return (
                        <button
                            type="button"
                            key={opt.label}
                            onClick={() => onSelect(opt.value)}
                            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                        >
                            <span>{opt.label}</span>
                            {selected && <Check size={14} />}
                        </button>
                    );
                })}
            </PopoverContent>
        </Popover>
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
                        <EphemeralSelector channelId={channelId} />
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
