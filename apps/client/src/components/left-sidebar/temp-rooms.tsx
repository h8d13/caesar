import { useCan } from '@/features/server/hooks';
import {
    closeTempRoom,
    createTempRoom,
    kickTempRoomGuest,
    viewTempRoom
} from '@/features/server/temp-rooms/actions';
import { useTempRoom } from '@/features/server/temp-rooms/hooks';
import { getTempRoomLink } from '@/features/server/temp-rooms/link';
import { TEMP_ROOMS_QUERY_KEY } from '@/features/server/temp-rooms/subscriptions';
import { useJoinTempRoom } from '@/hooks/use-join-temp-room';
import { queryClient } from '@/lib/query-client';
import { getTRPCClient } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import {
    Permission,
    type TTempRoomParticipant,
    type TTempRoomWithToken
} from '@caesar/shared';
import { IconButton } from '@caesar/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, Plus, Timer, UserX, X } from 'lucide-react';
import { memo, useCallback } from 'react';
import { toast } from 'sonner';

const NO_ROOMS: TTempRoomWithToken[] = [];

const refreshRooms = () =>
    queryClient.invalidateQueries({ queryKey: TEMP_ROOMS_QUERY_KEY });

const copyRoomLink = (token: string) => {
    navigator.clipboard.writeText(getTempRoomLink(token)).then(
        () => toast.success('Room link copied. Anyone with it can join.'),
        () => toast.error('Could not copy the link')
    );
};

type TGuestRowProps = {
    roomId: number;
    guest: TTempRoomParticipant;
};

const GuestRow = memo(({ roomId, guest }: TGuestRowProps) => {
    const onRemove = useCallback(async () => {
        await kickTempRoomGuest(roomId, guest.id);
        void refreshRooms();
    }, [roomId, guest.id]);

    return (
        <div className="group flex items-center justify-between pl-8 pr-2 py-0.5 text-xs text-muted-foreground">
            <span className="truncate">{guest.name} (guest)</span>
            <IconButton
                icon={UserX}
                variant="ghost"
                size="sm"
                title="Remove guest"
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={onRemove}
            />
        </div>
    );
});

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

    const onCopy = useCallback(() => copyRoomLink(room.token), [room.token]);

    const onClose = useCallback(async () => {
        await closeTempRoom(room.id);
        void refreshRooms();
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
                <Timer className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{room.name}</span>
                <span className="text-xs tabular-nums">
                    {room.participants.length}
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
            {room.participants
                .filter((participant) => participant.isGuest)
                .map((guest) => (
                    <GuestRow key={guest.id} roomId={room.id} guest={guest} />
                ))}
        </>
    );
});

// Temp rooms: voice rooms outside the channel list that anyone holding the
// link can join without an account. Lists the rooms the user manages (their
// own, or all of them for a moderator) and the one they are in.
const TempRooms = memo(() => {
    const can = useCan();
    const canCreate = can(Permission.CREATE_TEMP_ROOMS);
    const currentRoom = useTempRoom();
    const joinRoom = useJoinTempRoom();

    const { data: rooms = NO_ROOMS } = useQuery({
        queryKey: TEMP_ROOMS_QUERY_KEY,
        queryFn: () => getTRPCClient().tempRooms.list.query()
    });

    const onCreate = useCallback(async () => {
        const room = await createTempRoom();

        if (!room) return;

        copyRoomLink(room.token);
        void refreshRooms();
    }, []);

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
                        title="Open a temp room and copy its link"
                        onClick={onCreate}
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
                <div
                    className="flex items-center gap-2 px-2 py-1.5 mx-2 rounded-md text-sm cursor-pointer select-none bg-accent text-accent-foreground"
                    onClick={viewTempRoom}
                    title="Show the room"
                >
                    <Timer className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{currentRoom.name}</span>
                </div>
            )}
        </div>
    );
});

export { TempRooms };
