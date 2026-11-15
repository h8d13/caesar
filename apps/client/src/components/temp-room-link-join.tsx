import {
    clearTempRoomLink,
    getPendingTempRoomToken,
    setPendingTempRoomToken,
    useTempRoomLinkToken
} from '@/features/server/temp-rooms/link';
import { useJoinTempRoom } from '@/hooks/use-join-temp-room';
import { memo, useEffect } from 'react';

// A signed-in member who opened a temp room link (or picked "I have an
// account" on the guest screen) joins that room right away: opening the
// link is the request. The link is taken out of the URL, so a reload or a
// bookmark of the page does not join again. A failed join (dead link, full
// room) is reported by the join itself.
const TempRoomLinkJoin = memo(() => {
    const linkToken = useTempRoomLinkToken();
    const joinRoom = useJoinTempRoom();

    useEffect(() => {
        const token = linkToken ?? getPendingTempRoomToken();

        if (!token) return;

        clearTempRoomLink();
        setPendingTempRoomToken(undefined);

        void joinRoom(token);
    }, [linkToken, joinRoom]);

    return null;
});

export { TempRoomLinkJoin };
