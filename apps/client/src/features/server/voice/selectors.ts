import type { IRootState } from '@/features/store';
import { createCachedSelector } from 're-reselect';

export const ownVoiceStateSelector = (state: IRootState) => {
    return state.server.ownVoiceState;
};

export const pinnedCardSelector = (state: IRootState) =>
    state.server.pinnedCard;

export const voiceChannelStateSelector = (
    state: IRootState,
    channelId: number
) => state.server.voiceMap[channelId];

export const hasSharingScreenUsersSelector = createCachedSelector(
    voiceChannelStateSelector,
    (voiceState) => {
        if (!voiceState) return false;
        return Object.values(voiceState.users).some((u) => u.sharingScreen);
    }
)((_state: IRootState, channelId: number) => channelId);

export const hideNonVideoParticipantsSelector = (state: IRootState) =>
    state.server.hideNonVideoParticipants;

export const showUserBannersInVoiceSelector = (state: IRootState) =>
    state.server.showUserBannersInVoice;

export const speakingIntensityForUserSelector = (
    state: IRootState,
    userId: number
): number => state.server.speakingMap[userId] ?? 0;
