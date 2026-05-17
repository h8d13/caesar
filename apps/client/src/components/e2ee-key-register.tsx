import { useIsConnected } from '@/features/server/hooks';
import { getMyPubB64, getPrivVersion, subscribePriv } from '@/lib/e2ee';
import { getTRPCClient } from '@/lib/trpc';
import { memo, useEffect, useRef, useSyncExternalStore } from 'react';

// Centralised E2EE public-key registration.
//
// joinServer flips ctx.authenticated server-side via the joinServer
// mutation; only AFTER that does keys.register accept the call. The
// connect screen's deferred derive (setTimeout(0) -> argon2id) used to
// fire register from inside its own callback, but argon2id blocks the
// main thread for ~1-2s, during which the awaited joinServer mutation
// can be still in flight. The register call could land at the server
// before joinServer had set authenticated=true, returning "You must be
// authenticated to perform this action."
//
// This controller waits for both isConnected (joinServer done) and a
// valid priv (myPubB64 present), and fires register once per derived
// keypair. Idempotent: tracks the last-registered pub so re-renders
// don't re-fire.
const E2eeKeyRegister = memo(() => {
    const isConnected = useIsConnected();
    const privVersion = useSyncExternalStore(subscribePriv, getPrivVersion);
    const lastRegisteredRef = useRef<string | null>(null);

    useEffect(() => {
        if (!isConnected) return;

        const pub = getMyPubB64();
        if (!pub) return;
        if (lastRegisteredRef.current === pub) return;

        lastRegisteredRef.current = pub;

        getTRPCClient()
            .keys.register.mutate({ publicKey: pub })
            .catch((e) => {
                // Allow retry on next priv change if the call genuinely
                // failed (network glitch, etc.).
                lastRegisteredRef.current = null;
                console.warn('e2ee key register failed', e);
            });
    }, [isConnected, privVersion]);

    return null;
});

E2eeKeyRegister.displayName = 'E2eeKeyRegister';

export { E2eeKeyRegister };
