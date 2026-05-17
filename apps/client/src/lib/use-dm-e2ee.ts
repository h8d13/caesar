// React hook around dms.getE2eeContext.
// Cached per channel via react-query so compose + render share one fetch.

import { getTRPCClient } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { base64ToBytesSafe } from './base64';

type TE2eeContext = {
    ephemeralMs: number | null;
    peerUserId: number | null;
    peerPublicKey: Uint8Array | null;
};

const useDmE2eeContext = (
    channelId: number,
    isDm: boolean | undefined
): TE2eeContext | null => {
    const { data } = useQuery({
        enabled: !!isDm,
        queryKey: ['dms', 'e2eeContext', channelId],
        queryFn: () => getTRPCClient().dms.getE2eeContext.query({ channelId })
    });

    if (!data) return null;

    return {
        ephemeralMs: data.ephemeralMs ?? null,
        peerUserId: data.peerUserId ?? null,
        peerPublicKey: data.peerPublicKey
            ? base64ToBytesSafe(data.peerPublicKey)
            : null
    };
};

export { useDmE2eeContext, type TE2eeContext };
