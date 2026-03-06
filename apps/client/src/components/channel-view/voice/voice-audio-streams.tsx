import { useVoiceUsersByChannelId } from '@/features/server/hooks';
import { memo } from 'react';
import { useMediaRefs } from './hooks/use-media-refs';

type TVoiceUserAudioStreamProps = {
    userId: number;
};

const VoiceUserAudioStream = memo(({ userId }: TVoiceUserAudioStreamProps) => {
    const { audioRef, hasAudioStream } = useMediaRefs(userId);

    return (
        <>
            {hasAudioStream && (
                <audio
                    ref={audioRef}
                    className="hidden"
                    autoPlay
                    data-user-id={userId}
                />
            )}
        </>
    );
});

type TVoiceAudioStreamsProps = {
    channelId: number;
};

const VoiceAudioStreams = memo(({ channelId }: TVoiceAudioStreamsProps) => {
    const voiceUsers = useVoiceUsersByChannelId(channelId);

    return (
        <>
            {voiceUsers.map((voiceUser) => (
                <VoiceUserAudioStream
                    key={voiceUser.id}
                    userId={voiceUser.id}
                />
            ))}
        </>
    );
});

export { VoiceAudioStreams };
