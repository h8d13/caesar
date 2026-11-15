import { TEMP_ROOM_HASH_PARAM } from '@caesar/shared';
import { useSyncExternalStore } from 'react';

// A temp room link is `<origin>/#temp=<token>`. The token sits in the
// fragment so it never reaches the server in a request line (access logs)
// or a Referer header; it is only ever sent over the WebSocket, in the join
// call.

const PENDING_KEY = 'caesar-pending-temp-room';

const readHashToken = (): string | undefined => {
    const params = new URLSearchParams(window.location.hash.slice(1));

    return params.get(TEMP_ROOM_HASH_PARAM) || undefined;
};

const subscribe = (onChange: () => void) => {
    window.addEventListener('hashchange', onChange);

    return () => window.removeEventListener('hashchange', onChange);
};

// the token of the link this tab was opened with, while it is in the URL
const useTempRoomLinkToken = () =>
    useSyncExternalStore(subscribe, readHashToken);

const getTempRoomLink = (token: string) =>
    `${window.location.origin}/#${TEMP_ROOM_HASH_PARAM}=${token}`;

const clearTempRoomLink = () => {
    if (!readHashToken()) return;

    // assigning the hash (unlike replaceState) fires hashchange
    window.location.hash = '';
    window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search
    );
};

// "Sign in instead" on the guest screen: the link leaves the URL so the
// login page shows, and is offered again once signed in. Session storage
// throws when site data is blocked; the link is then simply forgotten.
const setPendingTempRoomToken = (token: string | undefined) => {
    try {
        if (token) sessionStorage.setItem(PENDING_KEY, token);
        else sessionStorage.removeItem(PENDING_KEY);
    } catch {
        // nothing to keep it in
    }
};

const getPendingTempRoomToken = (): string | undefined => {
    try {
        return sessionStorage.getItem(PENDING_KEY) || undefined;
    } catch {
        return undefined;
    }
};

export {
    clearTempRoomLink,
    getPendingTempRoomToken,
    getTempRoomLink,
    setPendingTempRoomToken,
    useTempRoomLinkToken
};
