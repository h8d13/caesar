import { resetApp } from '@/features/app/actions';
import { resetDialogs } from '@/features/dialogs/actions';
import { resetServerScreens } from '@/features/server-screens/actions';
import { resetServerState, setDisconnectInfo } from '@/features/server/actions';
import { connectedSelector } from '@/features/server/selectors';
import { store } from '@/features/store';
import {
    getLocalStorageItem,
    getSessionStorageItem,
    LocalStorageKey,
    removeLocalStorageItem,
    removeSessionStorageItem,
    SessionStorageKey
} from '@/helpers/storage';
import { isTransientClose } from '@/lib/close-policy';
import { clearPriv } from '@/lib/e2ee';
import { queryClient } from '@/lib/query-client';
// AppRouter is the server's router type; imported directly via the
// @server/* alias (the agreed channel for cross-workspace server refs).
// Top-level `import type` (not inline `import { type ... }`) is required
// here: Rolldown resolves the module before stripping type-only specifiers,
// so the inline form pulls the real server router tree (and its Node-only
// imports like @libsql/client) into the client bundle.
import type { TConnectionParams } from '@caesar/shared';
import type { AppRouter } from '@server/routers';
import { createTRPCProxyClient, createWSClient, wsLink } from '@trpc/client';

let wsClient: ReturnType<typeof createWSClient> | null = null;
let trpc: ReturnType<typeof createTRPCProxyClient<AppRouter>> | null = null;
let currentHost: string | null = null;
let isCleaningUp = false;

const initializeTRPC = (host: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';

    wsClient = createWSClient({
        url: `${protocol}://${host}`,
        // @ts-expect-error - the onclose type is not correct in trpc
        onClose: (cause: CloseEvent) => {
            const transient = isTransientClose(
                cause.code,
                connectedSelector(store.getState())
            );

            cleanup(transient);

            // transport loss: leave disconnectInfo unset so
            // AutoLoginController resumes with the kept token
            if (
                transient &&
                getLocalStorageItem(LocalStorageKey.AUTO_LOGIN_TOKEN)
            )
                return;

            setDisconnectInfo({
                code: cause.code,
                reason: cause.reason,
                wasClean: cause.wasClean,
                time: new Date()
            });
        },
        connectionParams: async (): Promise<TConnectionParams> => {
            return {
                token: getSessionStorageItem(SessionStorageKey.TOKEN) || ''
            };
        },
        keepAlive: {
            enabled: true,
            intervalMs: 30_000,
            pongTimeoutMs: 5_000
        }
    });

    trpc = createTRPCProxyClient<AppRouter>({
        links: [wsLink({ client: wsClient })]
    });

    currentHost = host;

    return trpc;
};

const connectToTRPC = (host: string) => {
    if (trpc && currentHost === host) {
        return trpc;
    }

    return initializeTRPC(host);
};

const getTRPCClient = () => {
    if (!trpc) {
        throw new Error('TRPC client is not initialized');
    }

    return trpc;
};

const cleanup = (keepToken = false) => {
    if (isCleaningUp) {
        return;
    }

    isCleaningUp = true;

    if (wsClient) {
        void wsClient.close();
        wsClient = null;
    }

    trpc = null;
    currentHost = null;

    // dropping the token stops auto-login loops on a rejected token; kept
    // on transport loss (backgrounded PWA, Firefox refresh) so it resumes
    if (!keepToken) removeLocalStorageItem(LocalStorageKey.AUTO_LOGIN_TOKEN);

    resetServerScreens();
    resetServerState();
    resetDialogs();
    resetApp();

    removeSessionStorageItem(SessionStorageKey.TOKEN);

    // the key and the query cache (per-viewer E2EE context, decrypted
    // plaintext) belong to this session's user; a later login in this tab
    // must never see, register or encrypt with them
    clearPriv();
    queryClient.clear();

    // this should help Firefox users who report that auto login is not consistent
    setTimeout(() => {
        isCleaningUp = false;
    }, 100);
};

export { cleanup, connectToTRPC, getTRPCClient };
