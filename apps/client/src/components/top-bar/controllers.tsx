import { UserAvatar } from '@/components/user-avatar';
import {
    useMediaControl,
    type TVolumeKey
} from '@/components/voice-provider/media-control-context';
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
} from '@sharkord/ui';
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

enum VideoStreamType {
    Webcam = 0,
    ScreenShare = 1
}

const SOUNDBOARD_VOLUME_KEY = 'soundboard' as const;

type AudioStream = {
    kind: 'audio';
    volumeKey: TVolumeKey;
    userId?: number;
    name: string;
    type: AudioStreamType;
};

type VideoStream = {
    kind: 'video';
    visibilityKey: string;
    userId: number;
    name: string;
    type: VideoStreamType;
};

type ControlStream = AudioStream | VideoStream;

const AudioStreamControl = memo(
    ({ userId, volumeKey, type, name }: AudioStreamControlProps) => {
        const user = useUserById(userId || 0);
        const { getVolume, setVolume, toggleMute } = useMediaControl();
        const volume = getVolume(volumeKey);
        const isMuted = volume === 0;

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
                    {type === AudioStreamType.ScreenShare && (
                        <Monitor className="h-3 w-3 text-muted-foreground" />
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

type VideoAudioStreamControlProps = {
    userId: number;
    visibilityKey: string;
    name: string;
    type: VideoStreamType;
};

const VideoAudioStreamControl = memo(
    ({ userId, visibilityKey, type, name }: VideoAudioStreamControlProps) => {
        const user = useUserById(userId);
        const { isStreamHidden, toggleStreamVisibility } = useMediaControl();
        const hidden = isStreamHidden(visibilityKey);

        const isWebcam = type === VideoStreamType.Webcam;
        const IconOn = isWebcam ? Video : Monitor;
        const IconOff = isWebcam ? VideoOff : MonitorOff;
        const label = isWebcam ? 'Webcam' : 'Screen Share';

        return (
            <div className="flex items-center gap-3 py-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {user ? (
                        <UserAvatar userId={user.id} className="h-6 w-6" />
                    ) : (
                        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                            <IconOn className="h-3 w-3 text-muted-foreground" />
                        </div>
                    )}
                    <span className="text-sm truncate flex-1">{name}</span>
                    <span className="text-xs text-muted-foreground">
                        {label}
                    </span>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleStreamVisibility(visibilityKey)}
                        className="h-6 w-6 p-0"
                    >
                        {hidden ? (
                            <IconOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                            <IconOn className="h-4 w-4" />
                        )}
                    </Button>
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
    const controlStreams = useMemo(() => {
        const streams: ControlStream[] = [];

        voiceUsers.forEach((voiceUser) => {
            if (voiceUser.id === ownUserId) return;

            streams.push({
                kind: 'audio',
                volumeKey: getUserVolumeKey(voiceUser.id),
                userId: voiceUser.id,
                name: voiceUser.name,
                type: AudioStreamType.Voice
            });

            if (voiceUser.state.webcamEnabled) {
                streams.push({
                    kind: 'video',
                    visibilityKey: getUserVideoKey(voiceUser.id),
                    userId: voiceUser.id,
                    name: voiceUser.name,
                    type: VideoStreamType.Webcam
                });
            }

            if (voiceUser.state.sharingScreen) {
                streams.push({
                    kind: 'audio',
                    volumeKey: getUserScreenVolumeKey(voiceUser.id),
                    userId: voiceUser.id,
                    name: voiceUser.name,
                    type: AudioStreamType.ScreenShare
                });

                streams.push({
                    kind: 'video',
                    visibilityKey: getUserScreenVideoKey(voiceUser.id),
                    userId: voiceUser.id,
                    name: voiceUser.name,
                    type: VideoStreamType.ScreenShare
                });
            }
        });

        externalAudioStreams.forEach((stream) => {
            streams.push({
                kind: 'audio',
                volumeKey: getExternalVolumeKey(stream.sourceId, stream.key),
                name: stream.title || 'External Audio',
                type: AudioStreamType.External
            });
        });

        streams.push({
            kind: 'audio',
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
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 transition-all duration-200 ease-in-out"
                >
                    <Tooltip content="Controls" asChild={false}>
                        <Settings2 className="w-4 h-4" />
                    </Tooltip>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-96">
                <div className="space-y-2">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-sm">Controls</h4>
                        <span className="text-xs text-muted-foreground">
                            {controlStreams.length}{' '}
                            {controlStreams.length === 1 ? 'stream' : 'streams'}
                        </span>
                    </div>

                    <div className="space-y-1 max-h-96 overflow-y-auto">
                        {controlStreams.map((stream) =>
                            stream.kind === 'audio' ? (
                                <AudioStreamControl
                                    key={stream.volumeKey}
                                    userId={stream.userId}
                                    volumeKey={stream.volumeKey}
                                    name={stream.name}
                                    type={stream.type}
                                />
                            ) : (
                                <VideoAudioStreamControl
                                    key={stream.visibilityKey}
                                    userId={stream.userId}
                                    visibilityKey={stream.visibilityKey}
                                    name={stream.name}
                                    type={stream.type}
                                />
                            )
                        )}
                        {controlStreams.length === 0 && (
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
