import { TypingDots } from '@/components/typing-dots';
import {
    useChannelById,
    useCurrentVoiceChannelId,
    useSelectedChannelId
} from '@/features/server/channels/hooks';
import {
    useCan,
    useChannelCan,
    useHasSharingScreenUsers,
    useHasUnreadMention,
    useHasUnreadMentions,
    useTypingUsersByChannelId,
    useUnreadMessagesCount,
    useVoiceUsersByChannelId
} from '@/features/server/hooks';
import { cn } from '@/lib/utils';
import { ChannelPermission, Permission, type TChannel } from '@caesar/shared';
import {
    closestCorners,
    pointerIntersection,
    type CollisionDetector
} from '@dnd-kit/collision';
import { useDroppable } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { Hash, Volume2 } from 'lucide-react';
import { memo, useCallback } from 'react';
import { ChannelContextMenu } from '../context-menus/channel';
import { UnreadCount } from '../unread-count';
import { CallTime } from './call-time';
import { useSelectChannel } from './hooks';
import { VoiceUser } from './voice-user';
import { Waveform } from './waveform';

// Member drags target the channel the pointer is literally inside (its
// sortable node spans the whole channel incl. its user list). closestCorners
// is corner-distance based and gets ambiguous between adjacent channels;
// pointerIntersection has no nearest-fallback, so a drop in the gap simply
// no-ops instead of snapping to the wrong channel. Reorder keeps corners.
const channelCollision: CollisionDetector = (input) =>
    input.dragOperation.source?.type === 'voice-user'
        ? pointerIntersection(input)
        : closestCorners(input);

const CHANNEL_ACCEPT = 'channel';
const VOICE_CHANNEL_ACCEPT = ['channel', 'voice-user'];
const DROP_ONLY = { draggable: true, droppable: false };

type TVoiceProps = Omit<TItemWrapperProps, 'children'> & {
    channel: TChannel;
};

const Voice = memo(({ channel, ...props }: TVoiceProps) => {
    const users = useVoiceUsersByChannelId(channel.id);
    const unreadCount = useUnreadMessagesCount(channel.id);
    const hasUnreadMention = useHasUnreadMention(channel.id);
    const currentVoiceChannelId = useCurrentVoiceChannelId();
    const hasSharingScreenUsers = useHasSharingScreenUsers(channel.id);

    const isVoiceActive = users.length > 0;
    const isOwnChannel = currentVoiceChannelId === channel.id;

    return (
        <>
            <ItemWrapper
                {...props}
                className={cn(props.className, {
                    'text-blue-500': hasSharingScreenUsers,
                    'text-green-500': isOwnChannel && !hasSharingScreenUsers
                })}
            >
                {isVoiceActive ? (
                    <Waveform isScreenSharing={hasSharingScreenUsers} />
                ) : (
                    <Volume2 className="h-4 w-4" />
                )}
                <span className="flex items-center flex-1">
                    <span className="truncate">{channel.name}</span>
                    <CallTime channelId={channel.id} />
                </span>
                {hasUnreadMention && (
                    <span
                        className="ml-1 h-2 w-2 shrink-0 rounded-full bg-red-500"
                        title="You were mentioned"
                    />
                )}
                {!isVoiceActive && unreadCount > 0 && (
                    <UnreadCount count={unreadCount} />
                )}
            </ItemWrapper>
            {channel.type === 'VOICE' && (
                <div className="ml-6 space-y-1 mt-1">
                    {users.map((user) => (
                        <VoiceUser
                            key={user.id}
                            userId={user.id}
                            user={user}
                            channelId={channel.id}
                        />
                    ))}
                </div>
            )}
        </>
    );
});

type TTextProps = Omit<TItemWrapperProps, 'children'> & {
    channel: TChannel;
};

const Text = memo(({ channel, ...props }: TTextProps) => {
    const typingUsers = useTypingUsersByChannelId(channel.id);
    const unreadCount = useUnreadMessagesCount(channel.id);
    const hasUnreadMention = useHasUnreadMention(channel.id);
    const hasUnreadMessages = useHasUnreadMentions(channel.id);
    const hasTypingUsers = typingUsers.length > 0;

    return (
        <ItemWrapper {...props}>
            <Hash className="h-4 w-4" />
            <span className="flex-1">{channel.name}</span>
            {hasUnreadMention && (
                <span
                    className="ml-1 h-2 w-2 shrink-0 rounded-full bg-red-500"
                    title="You were mentioned"
                />
            )}
            {hasTypingUsers && (
                <div className="flex items-center gap-0.5 ml-auto">
                    <TypingDots className="space-x-0.5" />
                </div>
            )}
            {!hasTypingUsers && unreadCount > 0 && (
                <UnreadCount
                    count={unreadCount}
                    hasMention={hasUnreadMessages}
                />
            )}
        </ItemWrapper>
    );
});

type TItemWrapperProps = {
    children: React.ReactNode;
    className?: string;
    isSelected: boolean;
    onClick: () => void;
    handleRef?: (element: Element | null) => void;
    style?: React.CSSProperties;
    disabled?: boolean;
};

const ItemWrapper = memo(
    ({
        children,
        isSelected,
        onClick,
        className,
        handleRef,
        style,
        disabled = false
    }: TItemWrapperProps) => {
        // Plain <div> isn't keyboard-reachable. Adding role + tabIndex + a
        // key handler makes Tab focus the row and Enter/Space activate it,
        // matching every other selectable element in the app. The row is
        // also the drag handle (handleRef).
        const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (disabled) return;
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
            }
        };

        return (
            <div
                ref={handleRef}
                style={style}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled || undefined}
                className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground select-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    {
                        'bg-accent text-accent-foreground': isSelected,
                        'cursor-default opacity-50 hover:bg-transparent hover:text-muted-foreground':
                            disabled
                    },
                    className
                )}
                onClick={disabled ? undefined : onClick}
                onKeyDown={handleKeyDown}
            >
                {children}
            </div>
        );
    }
);

type TChannelProps = {
    channelId: number;
    categoryId: number;
    index: number;
    isSelected: boolean;
    onSelect: (channelId: number) => void;
};

const Channel = memo(
    ({ channelId, categoryId, index, isSelected, onSelect }: TChannelProps) => {
        const channel = useChannelById(channelId);
        const channelCan = useChannelCan(channelId);
        const can = useCan();
        const onClick = useCallback(
            () => onSelect(channelId),
            [onSelect, channelId]
        );
        const isVoiceTarget = channel?.type === 'VOICE' && !channel.isDm;

        const { ref, handleRef, isDragging } = useSortable({
            id: `ch-${channelId}`,
            index,
            group: categoryId,
            type: 'channel',
            accept: isVoiceTarget ? VOICE_CHANNEL_ACCEPT : CHANNEL_ACCEPT,
            collisionDetector: channelCollision,
            // Without MANAGE_CHANNELS the row still takes member drops.
            disabled: can(Permission.MANAGE_CHANNELS) ? false : DROP_ONLY
        });

        if (!channel) {
            return null;
        }

        if (!channelCan(ChannelPermission.VIEW_CHANNEL)) return null;

        return (
            <div ref={ref} style={{ opacity: isDragging ? 0.5 : 1 }}>
                <ChannelContextMenu channelId={channelId}>
                    <div>
                        {channel.type === 'TEXT' && (
                            <Text
                                channel={channel}
                                isSelected={isSelected}
                                onClick={onClick}
                                handleRef={handleRef}
                            />
                        )}
                        {channel.type === 'VOICE' && (
                            <Voice
                                channel={channel}
                                isSelected={isSelected}
                                onClick={onClick}
                                handleRef={handleRef}
                                disabled={
                                    !channelCan(ChannelPermission.JOIN) ||
                                    !can(Permission.JOIN_VOICE_CHANNELS)
                                }
                            />
                        )}
                    </div>
                </ChannelContextMenu>
            </div>
        );
    }
);

type TChannelsProps = {
    categoryId: number;
    // Ordered ids passed from <Categories> so cross-container drag can
    // move a channel between lists via onDragOver before commit.
    channelIds: number[];
};

const Channels = memo(({ categoryId, channelIds }: TChannelsProps) => {
    const selectedChannelId = useSelectedChannelId();

    // Droppable for the whole list. Catches drops in empty space (so empty
    // categories accept channels) and end-of-list drops past the last child.
    // min-h gives an empty list a real hit-target.
    const { ref } = useDroppable({
        id: `drop-cat-${categoryId}`,
        accept: CHANNEL_ACCEPT,
        collisionDetector: closestCorners
    });

    const onChannelClick = useSelectChannel();

    return (
        <div ref={ref} className="space-y-0.5 min-h-2">
            {channelIds.map((id, index) => (
                <Channel
                    key={id}
                    channelId={id}
                    categoryId={categoryId}
                    index={index}
                    isSelected={selectedChannelId === id}
                    onSelect={onChannelClick}
                />
            ))}
        </div>
    );
});

export { Channels };
