import type { IRootState } from '@/features/store';
import type { TTempRoomListParticipant, TVoiceUserState } from '@caesar/shared';
import { createSelector } from '@reduxjs/toolkit';
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

const DEFAULT_VOICE_STATE: TVoiceUserState = {
    micMuted: false,
    soundMuted: false,
    webcamEnabled: false,
    sharingScreen: false
};

// the room we are in, shaped like an entry of the server's room list
const currentTempRoomListParticipantsSelector = createSelector(
    [
        (state: IRootState) => state.server.tempRoomParticipants,
        (state: IRootState) =>
            state.server.tempRoom
                ? state.server.voiceMap[state.server.tempRoom.id]?.users
                : undefined
    ],
    (participants, voiceUsers): TTempRoomListParticipant[] =>
        participants.map((participant) => ({
            ...participant,
            state: voiceUsers?.[participant.id] ?? DEFAULT_VOICE_STATE
        }))
);

export const useCurrentTempRoomListParticipants = () =>
    useSelector(currentTempRoomListParticipantsSelector);

export const useIsGuestMode = () =>
    useSelector((state: IRootState) => state.server.guestMode);
