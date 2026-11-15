import { UserAvatar } from '@/components/user-avatar';
import { openDialog } from '@/features/dialogs/actions';
import { useCan } from '@/features/server/hooks';
import {
    closeTempRoom,
    kickTempRoomGuest,
    viewTempRoom
} from '@/features/server/temp-rooms/actions';
import {
    useCurrentTempRoomListParticipants,
    useTempRoom
} from '@/features/server/temp-rooms/hooks';
import { copyTempRoomLink } from '@/features/server/temp-rooms/link';
import { TEMP_ROOMS_QUERY_KEY } from '@/features/server/temp-rooms/subscriptions';
import { getInitialsFromName } from '@/helpers/get-initials-from-name';
import { useJoinTempRoom } from '@/hooks/use-join-temp-room';
import { getTRPCClient } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import {
    Permission,
    type TTempRoomListParticipant,
    type TTempRoomWithToken
} from '@caesar/shared';
import { Avatar, AvatarFallback, IconButton } from '@caesar/ui';
import { useQuery } from '@tanstack/react-query';
import {
    HeadphoneOff,
    Headphones,
    Link,
    Lock,
    Mic,
    MicOff,
    Monitor,
    Plus,
    Timer,
    UserX,
    Video,
    X
} from 'lucide-react';
import { memo, useCallback } from 'react';
import { Dialog } from '../dialogs/dialogs';
import { CallTime } from './call-time';

const NO_ROOMS: TTempRoomWithToken[] = [];

const openCreateDialog = () => openDialog(Dialog.CREATE_TEMP_ROOM);

type TRoomUserProps = {
    roomId: number;
    participant: TTempRoomListParticipant;
    // the viewer may remove guests from this room (creator or manager)
    canRemove: boolean;
};

// A participant under its room, like a user under a voice channel. Lighter
// than VoiceUser on purpose: no profile popover, drag or stream preview,
// none of which exist for a guest or for a room the viewer is not in.
const RoomUser = memo(({ roomId, participant, canRemove }: TRoomUserProps) => {
    const { id, name, isGuest, state } = participant;

    const onRemove = useCallback(() => {
        void kickTempRoomGuest(roomId, id);
    }, [roomId, id]);

    return (
        <div className="group flex items-center gap-2 px-2 py-1 rounded hover:bg-accent/30 text-sm">
            {isGuest ? (
                <Avatar className="h-5 w-5 bg-muted">
                    <AvatarFallback className="bg-muted text-[10px]">
                        {getInitialsFromName(name)}
                    </AvatarFallback>
                </Avatar>
            ) : (
                <UserAvatar
                    userId={id}
                    className="h-5 w-5 rounded-full"
                    showUserPopover={false}
                    showStatusBadge={false}
                />
            )}
            <span className="flex-1 truncate text-xs">
                {name}
                {isGuest && (
                    <span className="ml-1 text-muted-foreground">(guest)</span>
                )}
            </span>
            {isGuest && canRemove && (
                <IconButton
                    icon={UserX}
                    variant="destructive"
                    size="xs"
                    title="Remove guest from the room"
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={onRemove}
                />
            )}
            <div className="flex items-center gap-1 opacity-60">
                {state.micMuted ? (
                    <MicOff className="h-3 w-3 text-red-500" />
                ) : (
                    <Mic className="h-3 w-3 text-green-500" />
                )}
                {state.soundMuted ? (
                    <HeadphoneOff className="h-3 w-3 text-red-500" />
                ) : (
                    <Headphones className="h-3 w-3 text-green-500" />
                )}
                {state.webcamEnabled && (
                    <Video className="h-3 w-3 text-blue-500" />
                )}
                {state.sharingScreen && (
                    <Monitor className="h-3 w-3 text-purple-500" />
                )}
            </div>
        </div>
    );
});

type TRoomUsersProps = {
    roomId: number;
    participants: TTempRoomListParticipant[];
    canRemove: boolean;
};

const RoomUsers = memo(
    ({ roomId, participants, canRemove }: TRoomUsersProps) =>
        participants.length > 0 && (
            <div className="ml-8 mr-2 space-y-1 mt-1">
                {participants.map((participant) => (
                    <RoomUser
                        key={participant.id}
                        roomId={roomId}
                        participant={participant}
                        canRemove={canRemove}
                    />
                ))}
            </div>
        )
);

type TRoomRowProps = {
    room: TTempRoomWithToken;
    isCurrent: boolean;
    onJoin: (token: string) => void;
};

const RoomRow = memo(({ room, isCurrent, onJoin }: TRoomRowProps) => {
    const onSelect = useCallback(() => {
        if (isCurrent) viewTempRoom();
        else onJoin(room.token);
    }, [isCurrent, onJoin, room.token]);

    const onCopy = useCallback(
        () => copyTempRoomLink(room.token),
        [room.token]
    );

    const onClose = useCallback(() => {
        void closeTempRoom(room.id);
    }, [room.id]);

    return (
        <>
            <div
                className={cn(
                    'group flex items-center gap-2 px-2 py-1.5 mx-2 rounded-md text-sm cursor-pointer select-none',
                    isCurrent
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
                )}
                onClick={onSelect}
                title={isCurrent ? 'Show the room' : 'Join the room'}
            >
                {room.guestsAllowed ? (
                    <Timer className="h-4 w-4 shrink-0" />
                ) : (
                    <span title="Members only: guests cannot join">
                        <Lock className="h-4 w-4 shrink-0" />
                    </span>
                )}
                <span className="flex items-center flex-1 min-w-0">
                    <span className="truncate">{room.name}</span>
                    {isCurrent && <CallTime channelId={room.id} />}
                </span>
                <div
                    className="flex items-center"
                    onClick={(e) => e.stopPropagation()}
                >
                    <IconButton
                        icon={Link}
                        variant="ghost"
                        size="sm"
                        title="Copy the room link"
                        onClick={onCopy}
                    />
                    <IconButton
                        icon={X}
                        variant="ghost"
                        size="sm"
                        title="Close the room for everyone"
                        onClick={onClose}
                    />
                </div>
            </div>
            <RoomUsers
                roomId={room.id}
                participants={room.participants}
                canRemove
            />
        </>
    );
});

// Temp rooms: voice rooms outside the channel list that anyone holding the
// link can join without an account. Lists the rooms the user manages (their
// own, or all of them with MANAGE_TEMP_ROOMS) and the one they are in.
const TempRooms = memo(() => {
    const can = useCan();
    const canCreate = can(Permission.CREATE_TEMP_ROOMS);
    const currentRoom = useTempRoom();
    // only shown for a room joined by link that the server does not list
    // for us: the store then is all we know of it
    const currentParticipants = useCurrentTempRoomListParticipants();
    const joinRoom = useJoinTempRoom();

    // the permission is part of the key: being granted (or losing)
    // MANAGE_TEMP_ROOMS changes what the server lists, so it refetches
    const canManage = can(Permission.MANAGE_TEMP_ROOMS);

    const { data: rooms = NO_ROOMS } = useQuery({
        queryKey: [...TEMP_ROOMS_QUERY_KEY, canManage],
        queryFn: () => getTRPCClient().tempRooms.list.query()
    });

    // in a room someone else manages: joined by its link
    const isCurrentListed = rooms.some((room) => room.id === currentRoom?.id);

    if (!canCreate && rooms.length === 0 && !currentRoom) return null;

    return (
        <div className="border-t border-border py-2">
            <div className="flex items-center justify-between px-4 pb-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground select-none">
                    Temp rooms
                </span>
                {canCreate && (
                    <IconButton
                        icon={Plus}
                        variant="ghost"
                        size="sm"
                        title="Open a temp room"
                        onClick={openCreateDialog}
                    />
                )}
            </div>
            {rooms.map((room) => (
                <RoomRow
                    key={room.id}
                    room={room}
                    isCurrent={room.id === currentRoom?.id}
                    onJoin={joinRoom}
                />
            ))}
            {currentRoom && !isCurrentListed && (
                <>
                    <div
                        className="flex items-center gap-2 px-2 py-1.5 mx-2 rounded-md text-sm cursor-pointer select-none bg-accent text-accent-foreground"
                        onClick={viewTempRoom}
                        title="Show the room"
                    >
                        <Timer className="h-4 w-4 shrink-0" />
                        <span className="flex items-center flex-1 min-w-0">
                            <span className="truncate">{currentRoom.name}</span>
                            <CallTime channelId={currentRoom.id} />
                        </span>
                    </div>
                    <RoomUsers
                        roomId={currentRoom.id}
                        participants={currentParticipants}
                        canRemove={false}
                    />
                </>
            )}
        </div>
    );
});

export { TempRooms };
