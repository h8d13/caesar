import {
    useMediaControl,
    type TVolumeKey
} from '@/components/media-provider/media-control-context';
import { UserAvatar } from '@/components/user-avatar';
import { useVoiceUsersByChannelId } from '@/features/server/hooks';
import { useOwnUserId, useUserById } from '@/features/server/users/hooks';
import { useVoiceChannelAudioExternalStreams } from '@/features/server/voice/hooks';
import {
    Button,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Slider,
    Tooltip
} from '@caesar/ui';
import {
    Headphones,
    Monitor,
    MonitorOff,
    Music,
    Settings2,
    Video,
    VideoOff,
    Volume2,
    VolumeX
} from 'lucide-react';
import { memo, useMemo } from 'react';

type AudioStreamControlProps = {
    userId?: number;
    volumeKey: TVolumeKey;
    name: string;
    type: AudioStreamType;
    visibilityKey?: string;
};

type MediaControllerProps = {
    channelId: number;
};

enum AudioStreamType {
    Voice = 0,
    External = 1,
    ScreenShare = 2,
    Soundboard = 3
}

const SOUNDBOARD_VOLUME_KEY = 'soundboard' as const;

type AudioStream = {
    volumeKey: TVolumeKey;
    userId?: number;
    name: string;
    type: AudioStreamType;
    visibilityKey?: string;
};

const AudioStreamControl = memo(
    ({
        userId,
        volumeKey,
        type,
        name,
        visibilityKey
    }: AudioStreamControlProps) => {
        const user = useUserById(userId || 0);
        const {
            getVolume,
            setVolume,
            toggleMute,
            isStreamHidden,
            toggleStreamVisibility
        } = useMediaControl();
        const volume = getVolume(volumeKey);
        const isMuted = volume === 0;
        const hidden = visibilityKey ? isStreamHidden(visibilityKey) : false;

        const isScreenShare = type === AudioStreamType.ScreenShare;
        const isVoice = type === AudioStreamType.Voice;

        return (
            <div className="flex items-center gap-3 py-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {userId && user ? (
                        <UserAvatar userId={user.id} className="h-6 w-6" />
                    ) : (
                        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                            {type === AudioStreamType.Soundboard ? (
                                <Music className="h-3 w-3 text-muted-foreground" />
                            ) : (
                                <Headphones className="h-3 w-3 text-muted-foreground" />
                            )}
                        </div>
                    )}
                    <span className="text-sm truncate flex-1">{name}</span>
                    {visibilityKey && isScreenShare && (
                        <button
                            onClick={() =>
                                toggleStreamVisibility(visibilityKey)
                            }
                            className="cursor-pointer"
                        >
                            {hidden ? (
                                <MonitorOff className="h-3 w-3 text-muted-foreground" />
                            ) : (
                                <Monitor className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                            )}
                        </button>
                    )}
                    {visibilityKey && isVoice && (
                        <button
                            onClick={() =>
                                toggleStreamVisibility(visibilityKey)
                            }
                            className="cursor-pointer"
                        >
                            {hidden ? (
                                <VideoOff className="h-3 w-3 text-muted-foreground" />
                            ) : (
                                <Video className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                            )}
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleMute(volumeKey)}
                        className="h-6 w-6 p-0"
                    >
                        {isMuted ? (
                            <VolumeX className="h-4 w-4 text-muted-foreground" />
                        ) : (
                            <Volume2 className="h-4 w-4" />
                        )}
                    </Button>

                    <div className="w-24">
                        <Slider
                            value={[volume]}
                            onValueChange={(values) =>
                                setVolume(volumeKey, values[0] || 0)
                            }
                            min={0}
                            max={100}
                            step={1}
                            className="cursor-pointer"
                        />
                    </div>

                    <span className="text-xs text-muted-foreground w-8 text-right">
                        {volume}%
                    </span>
                </div>
            </div>
        );
    }
);

const MediaController = memo(({ channelId }: MediaControllerProps) => {
    const voiceUsers = useVoiceUsersByChannelId(channelId);
    const externalAudioStreams = useVoiceChannelAudioExternalStreams(channelId);
    const {
        getUserVolumeKey,
        getUserScreenVolumeKey,
        getExternalVolumeKey,
        getUserVideoKey,
        getUserScreenVideoKey
    } = useMediaControl();
    const ownUserId = useOwnUserId();
    const audioStreams = useMemo(() => {
        const streams: AudioStream[] = [];

        voiceUsers.forEach((voiceUser) => {
            if (voiceUser.id === ownUserId) return;

            streams.push({
                volumeKey: getUserVolumeKey(voiceUser.id),
                userId: voiceUser.id,
                name: voiceUser.name,
                type: AudioStreamType.Voice,
                visibilityKey: voiceUser.state.webcamEnabled
                    ? getUserVideoKey(voiceUser.id)
                    : undefined
            });

            if (voiceUser.state.sharingScreen) {
                streams.push({
                    volumeKey: getUserScreenVolumeKey(voiceUser.id),
                    userId: voiceUser.id,
                    name: voiceUser.name,
                    type: AudioStreamType.ScreenShare,
                    visibilityKey: getUserScreenVideoKey(voiceUser.id)
                });
            }
        });

        externalAudioStreams.forEach((stream) => {
            streams.push({
                volumeKey: getExternalVolumeKey(stream.sourceId, stream.key),
                name: stream.title || 'External Audio',
                type: AudioStreamType.External
            });
        });

        streams.push({
            volumeKey: SOUNDBOARD_VOLUME_KEY,
            name: 'Soundboard',
            type: AudioStreamType.Soundboard
        });

        return streams;
    }, [
        voiceUsers,
        externalAudioStreams,
        ownUserId,
        getUserVolumeKey,
        getUserScreenVolumeKey,
        getExternalVolumeKey,
        getUserVideoKey,
        getUserScreenVideoKey
    ]);

    return (
        <Popover>
            <Tooltip content="Controls">
                <PopoverTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 transition-all duration-200 ease-in-out"
                    >
                        <Settings2 className="w-4 h-4" />
                    </Button>
                </PopoverTrigger>
            </Tooltip>
            <PopoverContent align="end" className="w-80">
                <div className="space-y-2">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-sm">Controls</h4>
                        <span className="text-xs text-muted-foreground">
                            {audioStreams.length}{' '}
                            {audioStreams.length === 1 ? 'stream' : 'streams'}
                        </span>
                    </div>

                    <div className="space-y-1 max-h-96 overflow-y-auto">
                        {audioStreams.map((stream) => (
                            <AudioStreamControl
                                key={stream.volumeKey}
                                userId={stream.userId}
                                volumeKey={stream.volumeKey}
                                name={stream.name}
                                type={stream.type}
                                visibilityKey={stream.visibilityKey}
                            />
                        ))}
                        {audioStreams.length === 0 && (
                            <div className="text-sm text-muted-foreground py-4 text-center">
                                No remote streams available.
                            </div>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
});

export { MediaController };
