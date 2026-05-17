import { joinVoice } from '@/features/server/voice/actions';
import { useMedia } from '@/features/server/voice/hooks';
import { getTRPCClient } from '@/lib/trpc';
import { Phone, PhoneOff } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

type TProps = { channelId: number };

const DmCallButton = memo(({ channelId }: TProps) => {
    const { init } = useMedia();
    const [outgoing, setOutgoing] = useState(false);

    // Clear outgoing state when peer accepts (we join voice).
    useEffect(() => {
        const trpc = getTRPCClient();
        const sub = trpc.dms.onCallAccepted.subscribe(undefined, {
            onData: async (data) => {
                if (data.channelId !== channelId) return;
                setOutgoing(false);
                try {
                    const caps = await joinVoice(channelId);
                    if (!caps) {
                        toast.error('Failed to join voice channel');
                        return;
                    }
                    // mirror the regular voice-join path so mediasoup
                    // transport + producer get set up.
                    await init(caps, channelId);
                } catch {
                    toast.error('Could not start voice');
                }
            }
        });
        // Peer rejected / cancelled before accepting.
        const endedSub = trpc.dms.onCallEnded.subscribe(undefined, {
            onData: (data) => {
                if (data.channelId !== channelId) return;
                setOutgoing(false);
            }
        });
        return () => {
            sub.unsubscribe();
            endedSub.unsubscribe();
        };
    }, [channelId, init]);

    const onCall = useCallback(async () => {
        try {
            await getTRPCClient().dms.startCall.mutate({ channelId });
            setOutgoing(true);
        } catch {
            toast.error('Could not start call');
        }
    }, [channelId]);

    const onCancel = useCallback(async () => {
        try {
            await getTRPCClient().dms.hangupCall.mutate({ channelId });
            setOutgoing(false);
        } catch {
            toast.error('Could not cancel call');
        }
    }, [channelId]);

    if (outgoing) {
        return (
            <button
                type="button"
                onClick={onCancel}
                title="Cancel call"
                className="p-1.5 rounded-md transition-colors bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 animate-pulse"
            >
                <PhoneOff size={16} />
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={onCall}
            title="Start call"
            className="p-1.5 rounded-md transition-colors hover:bg-muted text-muted-foreground"
        >
            <Phone size={16} />
        </button>
    );
});

export { DmCallButton };
