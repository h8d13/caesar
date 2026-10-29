import {
    useChannelById,
    useDmReadByPeer
} from '@/features/server/channels/hooks';
import { useCan } from '@/features/server/hooks';
import { useLatestOwnMessageId } from '@/features/server/messages/hooks';
import {
    useIsOwnUser,
    useOwnUserId,
    useUserById
} from '@/features/server/users/hooks';
import { E2EE_LOCKED_MESSAGE, hasPriv } from '@/lib/e2ee';
import { useDecryptedMessage } from '@/lib/use-decrypted-message';
import { cn } from '@/lib/utils';
import { hasMention, Permission, type TJoinedMessage } from '@caesar/shared';
import { format } from 'date-fns';
import { Check, CornerUpRight } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { ExpiresBadge } from './expires-badge';
import { MessageActions } from './message-actions';
import { MessageEditInline } from './message-edit-inline';
import { MessageRenderer } from './renderer';

type TMessageProps = {
    message: TJoinedMessage;
    disableActions?: boolean;
    disableFiles?: boolean;
    disableReactions?: boolean;
    disableVotes?: boolean;
    // Hide the ephemeral "24h" countdown bubble. Group view sets this on
    // every message except the last so the TTL only shows once per group.
    hideExpiresBadge?: boolean;
    onReply?: (message: TJoinedMessage) => void;
    onScrollToMessage?: (messageId: number) => void;
};

const Message = memo(
    ({
        message,
        disableActions,
        disableFiles,
        disableReactions,
        disableVotes,
        hideExpiresBadge,
        onReply,
        onScrollToMessage
    }: TMessageProps) => {
        const [isEditing, setIsEditing] = useState(false);
        const isFromOwnUser = useIsOwnUser(message.userId);
        const ownUserId = useOwnUserId();
        const can = useCan();
        const channel = useChannelById(message.channelId);
        const dmReadByPeer = useDmReadByPeer(message.channelId);
        const latestOwnId = useLatestOwnMessageId(message.channelId);
        // pinned to the latest own message in the channel, and only
        // when the peer has read at least up to it. sliding forward as
        // new own messages are sent avoids stranding the mark mid-group.
        const showDmReadIndicator =
            !!channel?.isDm &&
            isFromOwnUser &&
            !!dmReadByPeer &&
            latestOwnId !== undefined &&
            message.id === latestOwnId &&
            dmReadByPeer.lastReadMessageId >= message.id;
        const decrypted = useDecryptedMessage(message, channel?.isDm);

        const displayMessage = useMemo<TJoinedMessage>(() => {
            if (decrypted.status === 'decrypted') {
                return { ...message, content: decrypted.content };
            }
            return message;
        }, [message, decrypted]);

        // edit stays with the author (the server enforces it too)
        const canDelete = useMemo(
            () => can(Permission.MANAGE_MESSAGES) || isFromOwnUser,
            [can, isFromOwnUser]
        );

        // highlight bar when @mentioned. checks decrypted content if E2EE.
        const isMentioned = useMemo(
            () => hasMention(displayMessage.content, ownUserId),
            [displayMessage.content, ownUserId]
        );

        const replyToUser = useUserById(message.replyTo?.userId ?? -1);

        const handleReply = useCallback(() => {
            onReply?.(message);
        }, [onReply, message]);

        const replyToId = message.replyTo?.id;
        const handleReplyPreviewClick = useCallback(() => {
            if (replyToId && onScrollToMessage) {
                onScrollToMessage(replyToId);
            }
        }, [replyToId, onScrollToMessage]);

        return (
            <div
                className={cn(
                    'min-w-0 flex-1 ml-1 relative hover:bg-secondary/50 rounded-md px-1 py-0.5 group',
                    isMentioned && 'border-l-2 border-primary bg-primary/5'
                )}
                data-message-id={message.id}
            >
                {!isEditing ? (
                    <>
                        {message.replyTo && (
                            <button
                                type="button"
                                onClick={handleReplyPreviewClick}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-0.5 max-w-full truncate transition-colors"
                            >
                                <CornerUpRight className="h-3 w-3 shrink-0" />
                                <span className="font-medium shrink-0">
                                    {replyToUser?.name ?? 'Unknown'}
                                </span>
                                <span className="truncate opacity-70">
                                    {decrypted.replyContent
                                        ? decrypted.replyContent
                                              .replace(/<[^>]*>/g, '')
                                              .slice(0, 100)
                                        : 'Click to see message'}
                                </span>
                            </button>
                        )}
                        {decrypted.status === 'expired' ? (
                            <span className="italic text-muted-foreground">
                                {hasPriv() ? 'expired' : E2EE_LOCKED_MESSAGE}
                            </span>
                        ) : (
                            <MessageRenderer
                                message={displayMessage}
                                disableFiles={disableFiles}
                                disableReactions={disableReactions}
                                disableVotes={disableVotes || !!channel?.isDm}
                            />
                        )}
                        {message.expiresAt != null && !hideExpiresBadge && (
                            <ExpiresBadge expiresAt={message.expiresAt} />
                        )}
                        {showDmReadIndicator && (
                            <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground/80 whitespace-nowrap">
                                <Check className="h-3 w-3" />
                                Read {format(dmReadByPeer.readAt, 'HH:mm')}
                            </span>
                        )}
                        {!disableActions && (
                            <MessageActions
                                onEdit={() => setIsEditing(true)}
                                onReply={onReply ? handleReply : undefined}
                                canEdit={isFromOwnUser}
                                canDelete={canDelete}
                                messageId={message.id}
                                channelId={message.channelId}
                                editable={message.editable ?? false}
                                isPinned={message.pinned ?? false}
                                disablePin={!!channel?.isDm}
                            />
                        )}
                    </>
                ) : (
                    <MessageEditInline
                        message={message}
                        initialContent={
                            decrypted.status === 'decrypted'
                                ? decrypted.content
                                : (message.content ?? '')
                        }
                        e2ee={message.expiresAt != null ? decrypted.e2ee : null}
                        onBlur={() => setIsEditing(false)}
                    />
                )}
            </div>
        );
    }
);

export { Message };
