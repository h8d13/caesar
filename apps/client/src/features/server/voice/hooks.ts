import {
    MediaProviderContext,
    MediaStatsContext
} from '@/components/media-provider/context';
import type { IRootState } from '@/features/store';
import { useContext } from 'react';
import { useSelector } from 'react-redux';
import {
    hideNonVideoParticipantsSelector,
    ownVoiceStateSelector,
    pinnedCardSelector,
    showUserBannersInVoiceSelector,
    speakingIntensityForUserSelector,
    voiceChannelStateSelector
} from './selectors';

export const useSpeakingIntensity = (userId: number) =>
    useSelector((state: IRootState) =>
        speakingIntensityForUserSelector(state, userId)
    );

export const useVoiceChannelState = (channelId: number) =>
    useSelector((state: IRootState) =>
        voiceChannelStateSelector(state, channelId)
    ) ?? { users: {}, activeSince: null };

export const useMedia = () => {
    const context = useContext(MediaProviderContext);

    if (!context) {
        throw new Error(
            'useMedia must be used within a MediasoupProvider component'
        );
    }

    return context;
};

export const useMediaStats = () => useContext(MediaStatsContext);

export const useOwnVoiceState = () => useSelector(ownVoiceStateSelector);

export const usePinnedCard = () => useSelector(pinnedCardSelector);

export const useHideNonVideoParticipants = () =>
    useSelector(hideNonVideoParticipantsSelector);

export const useShowUserBannersInVoice = () =>
    useSelector(showUserBannersInVoiceSelector);
