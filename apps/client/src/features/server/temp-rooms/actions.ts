import { setDmsOpen } from '@/features/app/actions';
import { store } from '@/features/store';
import { getHostFromServer } from '@/helpers/get-file-url';
import { cleanup, connectToTRPC, getTRPCClient } from '@/lib/trpc';
import { GUEST_WS_PATH, getTrpcError } from '@caesar/shared';
// type-only, like AppRouter in lib/trpc: see the note there
import type { GuestRouter } from '@server/routers/guest';
import type { createTRPCClient } from '@trpc/client';
import { toast } from 'sonner';
import { currentVoiceChannelIdSelector } from '../channels/selectors';
import { serverSliceActions } from '../slice';
import { leaveVoice } from '../voice/actions';
import { ownVoiceStateSelector } from '../voice/selectors';
import { subscribeToVoice } from '../voice/subscriptions';
import { subscribeToTempRoomParticipants } from './subscriptions';

let unsubscribeGuest: (() => void) | null = null;

const getOwnJoinState = () => {
    const { micMuted, soundMuted } = ownVoiceStateSelector(store.getState());

    return { micMuted, soundMuted };
};

// A signed-in member entering a room by its link. Returns what
// MediaProvider.init needs, or undefined when the join failed (toasted).
export const joinTempRoom = async (token: string) => {
    if (currentVoiceChannelIdSelector(store.getState()) !== undefined) {
        await leaveVoice({ reason: 'switch_channel' });
    }

    try {
        const joined = await getTRPCClient().tempRooms.join.mutate({
            token,
            state: getOwnJoinState()
        });

        store.dispatch(serverSliceActions.enterTempRoom(joined));
        // the room shows in the channel area, not the DM one
        setDmsOpen(false);

        return joined;
    } catch (error) {
        toast.error(getTrpcError(error, 'Failed to join the room'));
    }
};

// Back to the room's view after looking at another channel.
export const viewTempRoom = () => {
    const room = store.getState().server.tempRoom;

    if (!room) return;

    store.dispatch(serverSliceActions.viewTempRoom());
    setDmsOpen(false);
};

// Someone without an account: opens the guest socket, which only knows the
// room's voice procedures, and joins under a name. Throws with a message
// fit to show next to the form.
export const joinTempRoomAsGuest = async (token: string, name: string) => {
    const guest = connectToTRPC(
        getHostFromServer(),
        GUEST_WS_PATH
    ) as unknown as ReturnType<typeof createTRPCClient<GuestRouter>>;

    let joined;

    try {
        joined = await guest.tempRooms.joinAsGuest.mutate({
            token,
            name,
            state: getOwnJoinState()
        });
    } catch (error) {
        cleanup();

        throw new Error(getTrpcError(error, 'Could not join the room'), {
            cause: error
        });
    }

    const unsubscribeVoice = subscribeToVoice({ soundboard: false });
    const unsubscribeParticipants = subscribeToTempRoomParticipants();

    unsubscribeGuest = () => {
        unsubscribeVoice();
        unsubscribeParticipants();
    };

    store.dispatch(
        serverSliceActions.enterTempRoom({ ...joined, guestId: joined.ownId })
    );

    return joined;
};

// A guest has nothing but the room: leaving it drops the socket and the
// state with it.
export const leaveTempRoomAsGuest = async () => {
    await leaveVoice({ reason: 'user_disconnect_button' });

    unsubscribeGuest?.();
    unsubscribeGuest = null;

    cleanup();
};

export const createTempRoom = async (options: {
    name?: string;
    guestsAllowed: boolean;
}) => {
    try {
        return await getTRPCClient().tempRooms.create.mutate(options);
    } catch (error) {
        toast.error(getTrpcError(error, 'Failed to open a room'));
    }
};

export const closeTempRoom = async (roomId: number) => {
    try {
        await getTRPCClient().tempRooms.close.mutate({ roomId });
    } catch (error) {
        toast.error(getTrpcError(error, 'Failed to close the room'));
    }
};

export const kickTempRoomGuest = async (roomId: number, guestId: number) => {
    try {
        await getTRPCClient().tempRooms.kickGuest.mutate({ roomId, guestId });
    } catch (error) {
        toast.error(getTrpcError(error, 'Failed to remove the guest'));
    }
};
