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
            // the list of rooms we manage shows them too
            void queryClient.invalidateQueries({
                queryKey: TEMP_ROOMS_QUERY_KEY
            });
        },
        onError: (err) =>
            console.error('onTempRoomParticipants subscription error:', err)
    });

    return () => sub.unsubscribe();
};

// members only: a room we created closed (by us elsewhere, a moderator,
// its expiry)
const subscribeToTempRooms = () => {
    const unsubscribeParticipants = subscribeToTempRoomParticipants();

    const onClosedSub = getTRPCClient().tempRooms.onClosed.subscribe(
        undefined,
        {
            onData: () => {
                void queryClient.invalidateQueries({
                    queryKey: TEMP_ROOMS_QUERY_KEY
                });
            },
            onError: (err) =>
                console.error('onTempRoomClosed subscription error:', err)
        }
    );

    return () => {
        unsubscribeParticipants();
        onClosedSub.unsubscribe();
    };
};

export { subscribeToTempRoomParticipants, subscribeToTempRooms };
