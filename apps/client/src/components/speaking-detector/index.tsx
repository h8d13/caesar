import { useAudioLevel } from '@/components/channel-view/voice/hooks/use-audio-level';
import { currentVoiceChannelIdSelector } from '@/features/server/channels/selectors';
import { useIsOwnUser } from '@/features/server/users/hooks';
import { setUserSpeaking } from '@/features/server/voice/actions';
import { useMedia } from '@/features/server/voice/hooks';
import { voiceChannelStateSelector } from '@/features/server/voice/selectors';
import type { IRootState } from '@/features/store';
import { StreamKind } from '@caesar/shared';
import { memo, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';

type TUserSpeakingProbeProps = {
    userId: number;
};

const UserSpeakingProbe = memo(({ userId }: TUserSpeakingProbeProps) => {
    const { remoteUserStreams, localAudioStream } = useMedia();
    const isOwnUser = useIsOwnUser(userId);

    const stream = useMemo(() => {
        if (isOwnUser) return localAudioStream;
        return remoteUserStreams[userId]?.[StreamKind.AUDIO];
    }, [isOwnUser, localAudioStream, remoteUserStreams, userId]);

    const { isSpeaking, speakingIntensity } = useAudioLevel(stream);

    useEffect(() => {
        setUserSpeaking(userId, isSpeaking ? speakingIntensity : 0);
    }, [userId, isSpeaking, speakingIntensity]);

    useEffect(() => {
        return () => {
            setUserSpeaking(userId, 0);
        };
    }, [userId]);

    return null;
});

UserSpeakingProbe.displayName = 'UserSpeakingProbe';

const SpeakingDetector = memo(() => {
    const channelId = useSelector(currentVoiceChannelIdSelector);
    const voiceState = useSelector((state: IRootState) =>
        channelId == null
            ? undefined
            : voiceChannelStateSelector(state, channelId)
    );

    const userIds = useMemo(
        () => (voiceState ? Object.keys(voiceState.users).map(Number) : []),
        [voiceState]
    );

    if (userIds.length === 0) return null;

    return (
        <>
            {userIds.map((id) => (
                <UserSpeakingProbe key={id} userId={id} />
            ))}
        </>
    );
});

SpeakingDetector.displayName = 'SpeakingDetector';

export { SpeakingDetector };
