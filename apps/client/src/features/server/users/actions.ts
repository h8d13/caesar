import { store } from '@/features/store';
import { getUrlFromServer } from '@/helpers/get-file-url';
import {
    deriveAuthKey,
    derivePrivAsync,
    forgetSessionKey,
    persistSessionKey
} from '@/lib/e2ee';
import { getTRPCClient } from '@/lib/trpc';
import { UserStatus, type TJoinedPublicUser } from '@caesar/shared';
import { serverSliceActions } from '../slice';
import { userByIdSelector } from './selectors';

export const addUser = (user: TJoinedPublicUser) => {
    store.dispatch(serverSliceActions.addUser(user));
};

export const updateUser = (
    userId: number,
    user: Partial<TJoinedPublicUser>
) => {
    store.dispatch(serverSliceActions.updateUser({ userId, user }));
};

export const wipeUser = (userId: number) => {
    store.dispatch(serverSliceActions.wipeUser({ userId }));
};

export const reassignUser = (userId: number, targetUser: number) => {
    store.dispatch(
        serverSliceActions.reassignUser({ userId, deletedUserId: targetUser })
    );
};

export const handleUserJoin = (user: TJoinedPublicUser) => {
    const state = store.getState();
    const foundUser = userByIdSelector(state, user.id);

    // trust the broadcast status: the server masks it to OFFLINE for users
    // who have appearOffline=true. hard-coding ONLINE here previously made
    // appear-offline invisible to peers.
    if (foundUser) {
        updateUser(user.id, user);
    } else {
        addUser(user);
    }
};

// The WebSocket can't set cookies, so a mutation that re-mints this
// session's token hands back a one-time nonce instead; this trades it for
// the new HttpOnly cookie. Redeeming also needs the current cookie.
const redeemSessionRefresh = async (refreshNonce: string) => {
    const res = await fetch(`${getUrlFromServer()}/session/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nonce: refreshNonce })
    });

    if (!res.ok) {
        throw new Error('Could not refresh this session. Sign in again.');
    }
};

export const signOutOtherSessions = async () => {
    const trpc = getTRPCClient();
    const { refreshNonce } = await trpc.users.signOutOtherSessions.mutate();

    // Caller's current WS is preserved server-side, but its old cookie is
    // epoch-stale; swap in the new one so the next reconnect / page reload
    // works.
    await redeemSessionRefresh(refreshNonce);

    // the epoch bump revoked the old wrap key; same password, so re-seal the
    // key this session already holds under the new cookie
    persistSessionKey().catch(() => {});
};

export const updatePassword = async (values: {
    currentPassword: string;
    newPassword: string;
    confirmNewPassword: string;
}) => {
    const trpc = getTRPCClient();
    // authKeys are salted with the identity, which an auto-login session
    // never typed
    const { identity } = await trpc.users.me.query();
    const authKeyFor = async (password: string) =>
        deriveAuthKey(await derivePrivAsync(password, identity));

    const result = await trpc.users.updatePassword.mutate({
        currentAuthKey: await authKeyFor(values.currentPassword),
        newAuthKey: await authKeyFor(values.newPassword)
    });

    // A password change bumps sessionEpoch server-side, so the caller's old
    // cookie is now stale. Swap in the fresh one the server minted (same
    // pattern as signOutOtherSessions) so the next reconnect / reload works.
    await redeemSessionRefresh(result.refreshNonce);

    // the sealed key was derived from the old password; never re-seal it
    forgetSessionKey();
};

export const setAllowMultipleSessions = async (value: boolean) => {
    const trpc = getTRPCClient();
    const result = await trpc.users.setAllowMultipleSessions.mutate({ value });
    const ownUserId = store.getState().server.ownUserId;

    if (ownUserId) {
        updateUser(ownUserId, {
            allowMultipleSessions: result.allowMultipleSessions
        });
    }

    return result.allowMultipleSessions;
};

export const setSendDmReadReceipts = async (value: boolean) => {
    const trpc = getTRPCClient();
    const result = await trpc.users.setSendDmReadReceipts.mutate({ value });
    const ownUserId = store.getState().server.ownUserId;

    if (ownUserId) {
        updateUser(ownUserId, {
            sendDmReadReceipts: result.sendDmReadReceipts
        });
    }

    return result.sendDmReadReceipts;
};

export const setAppearOffline = async (value: boolean) => {
    const trpc = getTRPCClient();
    const result = await trpc.users.setAppearOffline.mutate({ value });
    const ownUserId = store.getState().server.ownUserId;

    if (ownUserId) {
        // mirror the server's status mask locally so the members list
        // updates without waiting for a re-join.
        updateUser(ownUserId, {
            appearOffline: result.appearOffline,
            status: result.appearOffline
                ? UserStatus.OFFLINE
                : UserStatus.ONLINE
        });
    }

    return result.appearOffline;
};
