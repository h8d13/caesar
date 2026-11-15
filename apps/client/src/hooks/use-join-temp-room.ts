import { joinTempRoom } from '@/features/server/temp-rooms/actions';
import { useMedia } from '@/features/server/voice/hooks';
import { toast } from 'sonner';
import { useLatestCallback } from './use-latest-callback';

// A signed-in member entering a temp room by its link token: the join, then
// the media setup, like selecting a voice channel does. Stable identity, so
// it can sit in a toast action or a memoized row.
const useJoinTempRoom = () => {
    const { init } = useMedia();

    return useLatestCallback(async (token: string) => {
        const joined = await joinTempRoom(token);

        if (!joined) return;

        try {
            await init(joined.routerRtpCapabilities, joined.room.id);
        } catch {
            toast.error('Failed to initialize voice connection');
        }
    });
};

export { useJoinTempRoom };
