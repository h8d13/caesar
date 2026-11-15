import { VoiceChannel } from '@/components/channel-view/voice';
import { VoiceAudioStreams } from '@/components/channel-view/voice/voice-audio-streams';
import { MediaProvider } from '@/components/media-provider';
import { useDisconnectInfo, useInfo } from '@/features/server/hooks';
import { ensureAudioCtxReady } from '@/features/server/sounds/actions';
import {
    joinTempRoomAsGuest,
    leaveTempRoomAsGuest
} from '@/features/server/temp-rooms/actions';
import {
    useTempRoom,
    useTempRoomParticipants
} from '@/features/server/temp-rooms/hooks';
import {
    clearTempRoomLink,
    setPendingTempRoomToken
} from '@/features/server/temp-rooms/link';
import { useMedia } from '@/features/server/voice/hooks';
import { getFileUrl } from '@/helpers/get-file-url';
import { cn } from '@/lib/utils';
import { DisconnectCode, GUEST_NAME_MAX_LENGTH } from '@caesar/shared';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Group,
    Input,
    Tooltip
} from '@caesar/ui';
import {
    HeadphoneOff,
    Headphones,
    Mic,
    MicOff,
    Monitor,
    MonitorOff,
    PhoneOff,
    Users,
    Video,
    VideoOff
} from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { toast } from 'sonner';

const GUEST_NAME_KEY = 'caesar-guest-name';

// storage throws when site data is blocked: the name is then just not kept
const loadGuestName = () => {
    try {
        return localStorage.getItem(GUEST_NAME_KEY) ?? '';
    } catch {
        return '';
    }
};

const saveGuestName = (name: string) => {
    try {
        localStorage.setItem(GUEST_NAME_KEY, name);
    } catch {
        // not kept
    }
};

// why the guest socket last closed, when that is worth telling
const getClosedMessage = (code: number | undefined) => {
    if (code === DisconnectCode.TEMP_ROOM_CLOSED) return 'The room was closed.';
    if (code === DisconnectCode.KICKED)
        return 'You were removed from the room.';
};

type TGuestJoinFormProps = {
    token: string;
};

// The form owns the name; the frame around it never re-renders on a
// keystroke.
const GuestJoinForm = memo(({ token }: TGuestJoinFormProps) => {
    const { init } = useMedia();
    const [name, setName] = useState(loadGuestName);
    const [error, setError] = useState<string>();
    const [joining, setJoining] = useState(false);
    const closedMessage = getClosedMessage(useDisconnectInfo()?.code);

    const join = useCallback(async () => {
        const trimmed = name.trim();

        if (!trimmed) {
            setError('Enter a name');
            return;
        }

        // inside the click: lets the room's sounds and remote audio play
        ensureAudioCtxReady();
        setError(undefined);
        setJoining(true);
        saveGuestName(trimmed);

        try {
            const joined = await joinTempRoomAsGuest(token, trimmed);

            await init(joined.routerRtpCapabilities, joined.room.id);
        } catch (e) {
            // a join that got in but could not set up media: do not stay in
            // the room as a silent ghost
            await leaveTempRoomAsGuest().catch(() => {});

            const message =
                e instanceof Error ? e.message : 'Could not join the room';

            // the form was replaced by the room view if the join itself
            // went through: the toast is what still shows then
            toast.error(message);
            setError(message);
            setJoining(false);
        }
    }, [name, token, init]);

    const signInInstead = useCallback(() => {
        setPendingTempRoomToken(token);
        clearTempRoomLink();
    }, [token]);

    return (
        <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
                e.preventDefault();
                void join();
            }}
        >
            {closedMessage && !error && (
                <p className="text-sm text-center text-muted-foreground">
                    {closedMessage}
                </p>
            )}
            <Group label="Your name" help="Shown to everyone in the room.">
                <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    error={error}
                    maxLength={GUEST_NAME_MAX_LENGTH}
                    autoComplete="nickname"
                    // Input swallows Enter itself, so the form never submits
                    onEnter={join}
                    autoFocus
                />
            </Group>
            <Button type="submit" className="w-full" disabled={joining}>
                {joining ? 'Joining…' : 'Join as guest'}
            </Button>
            <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={signInInstead}
                disabled={joining}
            >
                I have an account
            </Button>
        </form>
    );
});

const GuestJoinScreen = memo(({ token }: TGuestJoinFormProps) => {
    const info = useInfo();
    const logoSrc = info?.logo ? getFileUrl(info.logo) : '/logo.png';

    return (
        <div className="flex flex-col gap-2 justify-center items-center h-full p-4">
            <Card className="w-full max-w-sm gap-2">
                <CardHeader>
                    <CardTitle className="flex flex-col items-center gap-2 text-center">
                        <img
                            src={logoSrc}
                            alt={VITE_APP_NAME}
                            className={
                                info?.logo
                                    ? 'max-w-full max-h-24 object-contain rounded-xl'
                                    : 'w-24 h-24 rounded-xl'
                            }
                        />
                        <span className="text-xl font-bold leading-tight">
                            {info?.name ?? VITE_APP_NAME}
                        </span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <span className="text-sm text-muted-foreground text-center">
                        You were invited to a voice room. No account needed: you
                        will only see and hear this room.
                    </span>
                    <GuestJoinForm token={token} />
                </CardContent>
            </Card>
        </div>
    );
});

type TControlButtonProps = {
    label: string;
    active: boolean;
    activeClassName: string;
    onClick: () => void;
    children: React.ReactNode;
};

const ControlButton = memo(
    ({
        label,
        active,
        activeClassName,
        onClick,
        children
    }: TControlButtonProps) => (
        <Tooltip content={label}>
            <Button
                variant="ghost"
                size="icon"
                aria-label={label}
                className={cn(
                    'h-10 w-10 rounded-md transition-all duration-200',
                    active
                        ? activeClassName
                        : 'bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground'
                )}
                onClick={onClick}
            >
                {children}
            </Button>
        </Tooltip>
    )
);

const ON = 'bg-green-500/15 hover:bg-green-500/25 text-green-400';
const OFF = 'bg-red-500/15 hover:bg-red-500/25 text-red-400';
const SHARING = 'bg-blue-500/15 hover:bg-blue-500/25 text-blue-400';

const GuestControls = memo(() => {
    const {
        ownVoiceState,
        toggleMic,
        toggleSound,
        toggleWebcam,
        toggleScreenShare
    } = useMedia();

    const leave = useCallback(() => {
        void leaveTempRoomAsGuest();
    }, []);

    return (
        <div className="flex items-center justify-center gap-2 border-t border-border bg-secondary/30 px-4 py-3">
            <ControlButton
                label={ownVoiceState.micMuted ? 'Unmute' : 'Mute'}
                active={ownVoiceState.micMuted}
                activeClassName={OFF}
                onClick={toggleMic}
            >
                {ownVoiceState.micMuted ? (
                    <MicOff className="h-5 w-5" />
                ) : (
                    <Mic className="h-5 w-5" />
                )}
            </ControlButton>
            <ControlButton
                label={ownVoiceState.soundMuted ? 'Undeafen' : 'Deafen'}
                active={ownVoiceState.soundMuted}
                activeClassName={OFF}
                onClick={toggleSound}
            >
                {ownVoiceState.soundMuted ? (
                    <HeadphoneOff className="h-5 w-5" />
                ) : (
                    <Headphones className="h-5 w-5" />
                )}
            </ControlButton>
            <ControlButton
                label={
                    ownVoiceState.webcamEnabled
                        ? 'Turn off camera'
                        : 'Turn on camera'
                }
                active={ownVoiceState.webcamEnabled}
                activeClassName={ON}
                onClick={toggleWebcam}
            >
                {ownVoiceState.webcamEnabled ? (
                    <Video className="h-5 w-5" />
                ) : (
                    <VideoOff className="h-5 w-5" />
                )}
            </ControlButton>
            <ControlButton
                label={
                    ownVoiceState.sharingScreen
                        ? 'Stop screen share'
                        : 'Start screen share'
                }
                active={ownVoiceState.sharingScreen}
                activeClassName={SHARING}
                onClick={toggleScreenShare}
            >
                {ownVoiceState.sharingScreen ? (
                    <Monitor className="h-5 w-5" />
                ) : (
                    <MonitorOff className="h-5 w-5" />
                )}
            </ControlButton>
            <Button variant="destructive" className="ml-2" onClick={leave}>
                <PhoneOff className="h-4 w-4 mr-1.5" />
                Leave
            </Button>
        </div>
    );
});

type TGuestRoomViewProps = {
    roomId: number;
    roomName: string;
};

const GuestRoomView = memo(({ roomId, roomName }: TGuestRoomViewProps) => {
    const participantCount = useTempRoomParticipants().length;

    return (
        <div className="flex h-dvh flex-col bg-background text-foreground">
            <header className="flex h-12 items-center justify-between border-b border-border px-4">
                <h1 className="font-semibold truncate">{roomName}</h1>
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    {participantCount}
                </span>
            </header>
            <main className="flex flex-1 flex-col relative min-w-0 min-h-0">
                <VoiceChannel channelId={roomId} />
            </main>
            <VoiceAudioStreams channelId={roomId} />
            <GuestControls />
        </div>
    );
});

type TGuestRoomProps = {
    token: string;
};

// What someone without an account gets from a temp room link: a name
// prompt, then that one room. Nothing of the server is loaded or reachable:
// the socket behind it only has the room's voice procedures.
const GuestRoom = memo(({ token }: TGuestRoomProps) => {
    const room = useTempRoom();

    return (
        <MediaProvider>
            {room ? (
                <GuestRoomView roomId={room.id} roomName={room.name} />
            ) : (
                <GuestJoinScreen token={token} />
            )}
        </MediaProvider>
    );
});

export { GuestRoom };
