import type { IRootState } from '@/features/store';
import { useSelector } from 'react-redux';

export const useTempRoom = () =>
    useSelector((state: IRootState) => state.server.tempRoom);

export const useIsInTempRoom = () =>
    useSelector((state: IRootState) => state.server.tempRoom !== undefined);

export const useTempRoomParticipants = () =>
    useSelector((state: IRootState) => state.server.tempRoomParticipants);

// a boolean per card: a participant list change re-renders no card whose
// answer stays the same
export const useIsTempRoomGuest = (userId: number) =>
    useSelector((state: IRootState) =>
        state.server.tempRoomParticipants.some(
            (participant) => participant.id === userId && participant.isGuest
        )
    );

export const useIsGuestMode = () =>
    useSelector((state: IRootState) => state.server.guestMode);
