import { store } from '@/features/store';
import { queryClient } from '@/lib/query-client';
import { getTRPCClient } from '@/lib/trpc';
import { serverSliceActions } from '../slice';

export const TEMP_ROOMS_QUERY_KEY = ['temp-rooms'];

// on both sockets: who is in the room we are in, by name
const subscribeToTempRoomParticipants = () => {
    const sub = getTRPCClient().tempRooms.onParticipants.subscribe(undefined, {
        onData: (data) => {
            store.dispatch(serverSliceActions.setTempRoomParticipants(data));
        },
        onError: (err) =>
            console.error('onTempRoomParticipants subscription error:', err)
    });

    return () => sub.unsubscribe();
};

// members only: a room we may list (ours, or any with MANAGE_TEMP_ROOMS)
// opened, closed or changed occupants. The event carries nothing to show:
// the list is refetched, and the server filters it again.
const subscribeToTempRooms = () => {
    const unsubscribeParticipants = subscribeToTempRoomParticipants();

    const onChangedSub = getTRPCClient().tempRooms.onChanged.subscribe(
        undefined,
        {
            onData: () => {
                void queryClient.invalidateQueries({
                    queryKey: TEMP_ROOMS_QUERY_KEY
                });
            },
            onError: (err) =>
                console.error('onTempRoomsChanged subscription error:', err)
        }
    );

    return () => {
        unsubscribeParticipants();
        onChangedSub.unsubscribe();
    };
};

export { subscribeToTempRoomParticipants, subscribeToTempRooms };
