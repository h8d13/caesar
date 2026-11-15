import {
    clearTempRoomLink,
    getPendingTempRoomToken,
    setPendingTempRoomToken,
    useTempRoomLinkToken
} from '@/features/server/temp-rooms/link';
import { useJoinTempRoom } from '@/hooks/use-join-temp-room';
import { memo, useEffect } from 'react';
import { toast } from 'sonner';

// A signed-in member who opened a temp room link (or picked "I have an
// account" on the guest screen): offer the room instead of joining right
// away, since joining leaves the voice channel they may be in and turns the
// mic on. The link is taken out of the URL either way.
const TempRoomLinkPrompt = memo(() => {
    const linkToken = useTempRoomLinkToken();
    const joinRoom = useJoinTempRoom();

    useEffect(() => {
        const token = linkToken ?? getPendingTempRoomToken();

        if (!token) return;

        clearTempRoomLink();
        setPendingTempRoomToken(undefined);

        toast('You opened a temp room link', {
            description: 'Join the room? You will leave your current call.',
            duration: Infinity,
            action: { label: 'Join', onClick: () => void joinRoom(token) },
            cancel: { label: 'Not now', onClick: () => {} }
        });
    }, [linkToken, joinRoom]);

    return null;
});

export { TempRoomLinkPrompt };
