import { logDebug } from '@/helpers/browser-logger';
import { getHostFromServer, getUrlFromServer } from '@/helpers/get-file-url';
import { LocalStorageKey, removeLocalStorageItem } from '@/helpers/storage';
import { cleanup, connectToTRPC, getTRPCClient } from '@/lib/trpc';
import { type TPublicServerSettings } from '@caesar/shared';
import { toast } from 'sonner';
import { store } from '../store';
import { infoSelector } from './selectors';
import { serverSliceActions } from './slice';
import { initSubscriptions } from './subscriptions';

let unsubscribeFromServer: (() => void) | null = null;

export const resetServerState = () => {
    store.dispatch(serverSliceActions.resetState());
};

export const setPublicServerSettings = (
    settings: TPublicServerSettings | undefined
) => {
    store.dispatch(serverSliceActions.setPublicSettings(settings));
};

export const connect = async () => {
    const state = store.getState();
    const info = infoSelector(state);

    if (!info) {
        throw new Error('Failed to fetch server info');
    }

    const host = getHostFromServer();
    const trpc = connectToTRPC(host);

    const { handshakeHash } = await trpc.others.handshake.query();

    await joinServer(handshakeHash);
};

export const joinServer = async (handshakeHash: string) => {
    const trpc = getTRPCClient();
    const data = await trpc.others.joinServer.query({
        handshakeHash
    });

    logDebug('joinServer', data);

    unsubscribeFromServer = initSubscriptions();

    store.dispatch(serverSliceActions.setInitialData(data));

    // E2EE pub-key registration lives in <E2eeKeyRegister />, keyed on
    // isConnected: keys.register returns UNAUTHORIZED until joinServer has
    // authenticated the WS context.
};

export const disconnectFromServer = () => {
    // Explicit logout: drop the resume hint before cleanup, which bails
    // while a previous cleanup is still in flight.
    removeLocalStorageItem(LocalStorageKey.HAS_SESSION);

    // The session cookie is HttpOnly, so only the server can clear it: this
    // bumps sessionEpoch (every copy of the JWT stops authenticating) and
    // returns a clearing Set-Cookie. keepalive lets it finish even if the
    // page unloads right after.
    fetch(`${getUrlFromServer()}/logout`, {
        method: 'POST',
        keepalive: true
    }).catch(() => {});

    cleanup();
    unsubscribeFromServer?.();
};

window.useToken = async (token: string) => {
    const trpc = getTRPCClient();

    try {
        await trpc.others.useSecretToken.mutate({ token });

        toast.success('You are now an owner of this server');
    } catch {
        toast.error('Invalid access token');
    }
};
