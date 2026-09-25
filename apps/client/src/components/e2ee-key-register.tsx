import { useIsConnected } from '@/features/server/hooks';
import { getMyPubB64 } from '@/lib/e2ee';
import { getTRPCClient } from '@/lib/trpc';
import { memo, useEffect } from 'react';

// Registers this session's E2EE public key once joinServer has made the
// connection authenticated (keys.register rejects before that). The key is
// derived before connecting and fixed for the session, so one register per
// connection is enough; none happens after auto-login (no key).
const E2eeKeyRegister = memo(() => {
    const isConnected = useIsConnected();

    useEffect(() => {
        if (!isConnected) return;

        const pub = getMyPubB64();
        if (!pub) return;

        // server-side upsert: a repeat (reconnect, StrictMode) is harmless
        getTRPCClient()
            .keys.register.mutate({ publicKey: pub })
            .catch((e) => console.warn('e2ee key register failed', e));
    }, [isConnected]);

    return null;
});

E2eeKeyRegister.displayName = 'E2eeKeyRegister';

export { E2eeKeyRegister };
