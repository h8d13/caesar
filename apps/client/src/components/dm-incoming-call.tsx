import { setDmsOpen, setSelectedDmChannelId } from '@/features/app/actions';
import { startPeerIncomingCallRingLoop } from '@/features/server/sounds/actions';
import { useUserById } from '@/features/server/users/hooks';
import { joinVoice } from '@/features/server/voice/actions';
import { useMedia } from '@/features/server/voice/hooks';
import { getTRPCClient } from '@/lib/trpc';
import { Phone, PhoneOff } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

// Mounted once at the server level. Listens globally for incoming DM calls
// and renders a persistent notification regardless of which channel is open.
const DmIncomingCall = memo(() => {
    const { init } = useMedia();
    const [call, setCall] = useState<{
        channelId: number;
        callerId: number;
    } | null>(null);

    const dismiss = useCallback(() => setCall(null), []);

    const onAccept = useCallback(
        (channelId: number) => {
            dismiss();
            (async () => {
                try {
                    await getTRPCClient().dms.acceptCall.mutate({ channelId });
                    const caps = await joinVoice(channelId);
                    if (!caps) {
                        toast.error('Failed to join voice channel');
                        return;
                    }
                    await init(caps, channelId);
                    // Callee can be anywhere when accepting (server text
                    // channel, a different DM). Snap them to the DM that's
                    // now hosting the call so the panel + top-bar align.
                    setDmsOpen(true);
                    setSelectedDmChannelId(channelId);
                } catch {
                    toast.error('Could not accept call');
                }
            })();
        },
        [dismiss, init]
    );

    const onReject = useCallback(
        (channelId: number) => {
            dismiss();
            getTRPCClient()
                .dms.hangupCall.mutate({ channelId })
                .catch(() => {
                    /* peer may have hung up first, ignore */
                });
        },
        [dismiss]
    );

    useEffect(() => {
        const trpc = getTRPCClient();

        const ringSub = trpc.dms.onCallRing.subscribe(undefined, {
            onData: (data) => {
                setCall({ channelId: data.channelId, callerId: data.callerId });
            }
        });

        const endedSub = trpc.dms.onCallEnded.subscribe(undefined, {
            onData: () => dismiss()
        });

        return () => {
            ringSub.unsubscribe();
            endedSub.unsubscribe();
        };
    }, [dismiss]);

    // Audible incoming-call ring on the callee while the card is up.
    // Caller has their own dial-tone loop in DmCallButton; this variant
    // is brighter and faster so the two ends sound distinct.
    useEffect(() => {
        if (!call) return;
        return startPeerIncomingCallRingLoop();
    }, [call]);

    if (!call) return null;

    return (
        <IncomingCallCard
            callerId={call.callerId}
            onAccept={() => onAccept(call.channelId)}
            onReject={() => onReject(call.channelId)}
        />
    );
});

type TCardProps = {
    callerId: number;
    onAccept: () => void;
    onReject: () => void;
};

const IncomingCallCard = memo(
    ({ callerId, onAccept, onReject }: TCardProps) => {
        const caller = useUserById(callerId);

        return (
            <div className="fixed top-4 right-4 z-50 flex items-center gap-3 bg-card border border-border rounded-lg px-3 py-2 shadow-lg min-w-60">
                <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">
                        Incoming call
                    </p>
                    <p className="text-sm font-medium truncate">
                        {caller?.name ?? '...'}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onAccept}
                    title="Accept"
                    className="p-2 rounded-full bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 transition-colors"
                >
                    <Phone size={14} />
                </button>
                <button
                    type="button"
                    onClick={onReject}
                    title="Reject"
                    className="p-2 rounded-full bg-red-500/15 text-red-500 hover:bg-red-500/25 transition-colors"
                >
                    <PhoneOff size={14} />
                </button>
            </div>
        );
    }
);

export { DmIncomingCall };
