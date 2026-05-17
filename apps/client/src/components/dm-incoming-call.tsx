import { joinVoice } from '@/features/server/voice/actions';
import { useUserById } from '@/features/server/users/hooks';
import { getTRPCClient } from '@/lib/trpc';
import { useAppDispatch } from '@/store';
import { Phone, PhoneOff } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

// Mounted once at the server level. Listens globally for incoming DM calls
// and shows a persistent notification regardless of which channel is open.
const DmIncomingCall = memo(() => {
    const dispatch = useAppDispatch();
    const [call, setCall] = useState<{ channelId: number; callerId: number } | null>(null);
    const toastIdRef = useRef<string | number | null>(null);

    const dismiss = useCallback(() => {
        if (toastIdRef.current != null) {
            toast.dismiss(toastIdRef.current);
            toastIdRef.current = null;
        }
        setCall(null);
    }, []);

    const onAccept = useCallback(async (channelId: number) => {
        try {
            await getTRPCClient().dms.acceptCall.mutate({ channelId });
            dispatch(joinVoice(channelId));
        } catch {
            toast.error('Could not accept call');
        }
        dismiss();
    }, [dispatch, dismiss]);

    const onReject = useCallback(async (channelId: number) => {
        try {
            await getTRPCClient().dms.hangupCall.mutate({ channelId });
        } catch { /* ignore */ }
        dismiss();
    }, [dismiss]);

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

    // Show/update toast when call state changes.
    useEffect(() => {
        if (!call) return;

        const id = toast.custom(
            () => (
                <IncomingCallToast
                    callerId={call.callerId}
                    onAccept={() => onAccept(call.channelId)}
                    onReject={() => onReject(call.channelId)}
                />
            ),
            { duration: Infinity, id: toastIdRef.current ?? undefined }
        );
        toastIdRef.current = id;
    }, [call, onAccept, onReject]);

    return null;
});

type TToastProps = {
    callerId: number;
    onAccept: () => void;
    onReject: () => void;
};

const IncomingCallToast = memo(({ callerId, onAccept, onReject }: TToastProps) => {
    const caller = useUserById(callerId);

    return (
        <div className="flex items-center gap-3 bg-card border border-border rounded-lg px-3 py-2 shadow-lg min-w-60">
            <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Incoming call</p>
                <p className="text-sm font-medium truncate">{caller?.name ?? '...'}</p>
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
});

export { DmIncomingCall };
