import { store } from '@/features/store';
import {
    getLocalStorageItem,
    LocalStorageKey,
    SessionStorageKey,
    setLocalStorageItem,
    setSessionStorageItem
} from '@/helpers/storage';
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

export const signOutOtherSessions = async () => {
    const trpc = getTRPCClient();
    const result = await trpc.users.signOutOtherSessions.mutate();

    // Caller's current WS is preserved server-side, but its old token is
    // epoch-stale. Swap the new one into storage so the next reconnect /
    // page reload uses it. Only touch localStorage if it was already in
    // use (cross-tab opt-in); we don't want to silently enable persistence.
    setSessionStorageItem(SessionStorageKey.TOKEN, result.token);

    if (getLocalStorageItem(LocalStorageKey.AUTO_LOGIN_TOKEN)) {
        setLocalStorageItem(LocalStorageKey.AUTO_LOGIN_TOKEN, result.token);
    }

    return result.token;
};

export const updatePassword = async (values: {
    currentPassword: string;
    newPassword: string;
    confirmNewPassword: string;
}) => {
    const trpc = getTRPCClient();
    const result = await trpc.users.updatePassword.mutate(values);

    // A password change bumps sessionEpoch server-side, so the caller's old
    // token is now stale. Swap in the fresh one the server minted (same
    // pattern as signOutOtherSessions) so the next reconnect / reload works.
    setSessionStorageItem(SessionStorageKey.TOKEN, result.token);

    if (getLocalStorageItem(LocalStorageKey.AUTO_LOGIN_TOKEN)) {
        setLocalStorageItem(LocalStorageKey.AUTO_LOGIN_TOKEN, result.token);
    }
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
