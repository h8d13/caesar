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
import { useVoiceChannelExternalStreamsList } from '@/features/server/voice/hooks';
import { cn } from '@/lib/utils';
import { ChannelPermission, Permission, type TChannel } from '@caesar/shared';
import { useDroppable } from '@dnd-kit/core';
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Hash, Volume2 } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { ChannelContextMenu } from '../context-menus/channel';
import { UnreadCount } from '../unread-count';
import { CallTime } from './call-time';
import { ExternalStream } from './external-stream';
import { useSelectChannel } from './hooks';
import { VoiceUser } from './voice-user';
import { Waveform } from './waveform';

type TVoiceProps = Omit<TItemWrapperProps, 'children'> & {
    channel: TChannel;
};

const Voice = memo(({ channel, ...props }: TVoiceProps) => {
    const users = useVoiceUsersByChannelId(channel.id);
    const externalStreams = useVoiceChannelExternalStreamsList(channel.id);
    const unreadCount = useUnreadMessagesCount(channel.id);
    const hasUnreadMention = useHasUnreadMention(channel.id);
    const currentVoiceChannelId = useCurrentVoiceChannelId();
    const hasSharingScreenUsers = useHasSharingScreenUsers(channel.id);

    const isVoiceActive = users.length > 0 || externalStreams.length > 0;
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
                    {externalStreams.map((stream) => (
                        <ExternalStream
                            key={stream.streamId}
                            title={stream.title}
                            tracks={stream.tracks}
                            avatarUrl={stream.avatarUrl}
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
    dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
    style?: React.CSSProperties;
    disabled?: boolean;
};

const ItemWrapper = memo(
    ({
        children,
        isSelected,
        onClick,
        className,
        dragHandleProps,
        style,
        disabled = false
    }: TItemWrapperProps) => {
        // Plain <div> isn't keyboard-reachable. Adding role + tabIndex + a
        // key handler makes Tab focus the row and Enter/Space activate it,
        // matching every other selectable element in the app. Kept as a
        // <div> so @dnd-kit drag-handle listeners spread cleanly.
        const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (disabled) return;
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
            }
        };

        return (
            <div
                {...dragHandleProps}
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
    isSelected: boolean;
    onSelect: (channelId: number) => void;
};

const Channel = memo(({ channelId, isSelected, onSelect }: TChannelProps) => {
    const channel = useChannelById(channelId);
    const channelCan = useChannelCan(channelId);
    const can = useCan();
    const onClick = useCallback(
        () => onSelect(channelId),
        [onSelect, channelId]
    );

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: `ch-${channelId}` });

    if (!channel) {
        return null;
    }

    if (!channelCan(ChannelPermission.VIEW_CHANNEL)) return null;

    return (
        <div
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(
                    transform && { ...transform, x: 0 }
                ),
                transition,
                opacity: isDragging ? 0.5 : 1
            }}
        >
            <ChannelContextMenu channelId={channelId}>
                <div>
                    {channel.type === 'TEXT' && (
                        <Text
                            channel={channel}
                            isSelected={isSelected}
                            onClick={onClick}
                            dragHandleProps={{ ...attributes, ...listeners }}
                        />
                    )}
                    {channel.type === 'VOICE' && (
                        <Voice
                            channel={channel}
                            isSelected={isSelected}
                            onClick={onClick}
                            dragHandleProps={{ ...attributes, ...listeners }}
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
});

type TChannelsProps = {
    categoryId: number;
    // Ordered ids passed from <Categories> so cross-container drag can
    // optimistically swap items between lists via onDragOver before commit.
    channelIds: number[];
};

const Channels = memo(({ categoryId, channelIds }: TChannelsProps) => {
    const selectedChannelId = useSelectedChannelId();
    const can = useCan();
    const channelSortableIds = useMemo(
        () => channelIds.map((id) => `ch-${id}`),
        [channelIds]
    );

    // Droppable for the whole list. Catches drops in empty space (so empty
    // categories accept channels) and end-of-list drops past the last child.
    // min-h gives an empty list a real hit-target.
    const { setNodeRef } = useDroppable({ id: `drop-cat-${categoryId}` });

    const onChannelClick = useSelectChannel();

    return (
        <div ref={setNodeRef} className="space-y-0.5 min-h-2">
            <SortableContext
                items={channelSortableIds}
                strategy={verticalListSortingStrategy}
                disabled={!can(Permission.MANAGE_CHANNELS)}
            >
                {channelIds.map((id) => (
                    <Channel
                        key={id}
                        channelId={id}
                        isSelected={selectedChannelId === id}
                        onSelect={onChannelClick}
                    />
                ))}
            </SortableContext>
        </div>
    );
});

export { Channels };
