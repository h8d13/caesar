import { store } from '@/features/store';
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
