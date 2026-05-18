import { Dialog } from '@/components/dialogs/dialogs';
import {
    MessageCompose,
    type TMessageComposeHandle
} from '@/components/message-compose';
import { ResizableSidebar } from '@/components/resizable-sidebar';
import { openDialog } from '@/features/dialogs/actions';
import { useChannelById } from '@/features/server/channels/hooks';
import {
    useChannelCan,
    useTypingUsersByChannelId
} from '@/features/server/hooks';
import { useMessages } from '@/features/server/messages/hooks';
import {
    consumePendingScrollTarget,
    usePendingScrollTarget
} from '@/features/server/messages/pending-scroll';
import { playSound } from '@/features/server/sounds/actions';
import { SoundType } from '@/features/server/types';
import { useOwnUserId, useUsers } from '@/features/server/users/hooks';
import { handleBuiltInCommand } from '@/helpers/built-in-commands';
import { LocalStorageKey } from '@/helpers/storage';
import { throttle } from '@/helpers/throttle';
import { dmKey, hasPriv, open, seal } from '@/lib/e2ee';
import { getTRPCClient } from '@/lib/trpc';
import { useDmE2eeContext } from '@/lib/use-dm-e2ee';
import {
    ChannelPermission,
    DELETED_USER_IDENTITY_AND_NAME,
    TYPING_MS,
    getTrpcError,
    type TJoinedMessage
} from '@caesar/shared';
import { Spinner } from '@caesar/ui';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { MessagesGroup } from './messages-group';
import { TextSkeleton } from './text-skeleton';
import { TextTopbar } from './text-top-bar';
import {
    getChannelDraftKey,
    getDraftMessage,
    setDraftMessage
} from './use-draft-messages';
import { useScrollController } from './use-scroll-controller';
import { WhiteboardPanel } from './whiteboard/WhiteboardPanel';

type TChannelProps = {
    channelId: number;
};

const TextChannel = memo(({ channelId }: TChannelProps) => {
    const [whiteboardOpen, setWhiteboardOpen] = useState(false);
    const [replyingTo, setReplyingTo] = useState<TJoinedMessage | null>(null);

    const {
        messages,
        hasMore,
        loadMore,
        loading,
        fetching,
        groupedMessages,
        scrollToMessage
    } = useMessages(channelId);

    const draftChannelKey = getChannelDraftKey(channelId);

    const [newMessage, setNewMessage] = useState(
        getDraftMessage(draftChannelKey)
    );
    const channel = useChannelById(channelId);
    const allUsers = useUsers();
    const ownUserId = useOwnUserId();
    const e2eeContext = useDmE2eeContext(channelId, channel?.isDm);

    // Decrypt the "Replying to ..." preview shown above the compose area
    // when the target message was ephemeral. Returns null on miss; we then
    // fall back to a generic placeholder so no ciphertext ever leaks.
    const replyingToIsEphemeral = replyingTo?.expiresAt != null;
    const canDecryptReplyingTo =
        replyingToIsEphemeral &&
        replyingTo?.content != null &&
        hasPriv() &&
        e2eeContext?.peerPublicKey != null &&
        e2eeContext.peerUserId !== null &&
        ownUserId !== undefined;
    const { data: replyingToDecrypted } = useQuery({
        enabled: canDecryptReplyingTo,
        queryKey: [
            'e2ee',
            'decrypt-replying-to',
            replyingTo?.id,
            replyingTo?.content
        ],
        queryFn: async () => {
            const key = await dmKey(
                e2eeContext!.peerPublicKey!,
                ownUserId!,
                e2eeContext!.peerUserId!
            );
            return open(key, replyingTo!.content!);
        },
        staleTime: Infinity,
        retry: false
    });
    const replyingToPreview = replyingToIsEphemeral
        ? (replyingToDecrypted ?? null)
        : (replyingTo?.content ?? null);
    const mentionUsers = useMemo(
        () =>
            channel?.isDm
                ? undefined
                : allUsers.filter(
                      (u) => u.name !== DELETED_USER_IDENTITY_AND_NAME
                  ),
        [allUsers, channel?.isDm]
    );
    const typingUsers = useTypingUsersByChannelId(channelId);
    const composeRef = useRef<TMessageComposeHandle>(null);

    const { containerRef, onScroll } = useScrollController({
        messages,
        fetching,
        hasMore,
        loadMore,
        hasTypingUsers: typingUsers.length > 0
    });

    const channelCan = useChannelCan(channelId);

    const onReply = useCallback((message: TJoinedMessage) => {
        setReplyingTo(message);
    }, []);

    // Clear reply state on channel change
    useEffect(() => {
        setReplyingTo(null);
    }, [channelId]);

    const pendingScroll = usePendingScrollTarget();

    useEffect(() => {
        if (loading) return;
        if (pendingScroll === null) return;

        const target = consumePendingScrollTarget();
        if (target) {
            scrollToMessage(target);
        }
    }, [loading, pendingScroll, scrollToMessage]);

    const sendTypingSignal = useMemo(
        () =>
            throttle(async () => {
                const trpc = getTRPCClient();

                try {
                    await trpc.messages.signalTyping.mutate({ channelId });
                } catch {
                    // ignore
                }
            }, TYPING_MS),
        [channelId]
    );

    const setNewMessageHandler = useCallback(
        (value: string) => {
            setNewMessage(value);
            setDraftMessage(draftChannelKey, value);
        },
        [setNewMessage, draftChannelKey]
    );

    const onSend = useCallback(
        async (message: string, files: { id: string }[]) => {
            sendTypingSignal.cancel();

            if (
                files.length === 0 &&
                handleBuiltInCommand(message, channelId)
            ) {
                setNewMessageHandler('');
                return true;
            }

            const trpc = getTRPCClient();

            // E2EE: encrypt content if this DM is currently ephemeral.
            // Re-fetch ephemeral state right before send to avoid sending
            // ciphertext to a channel where the toggle was just turned off
            // (server enforces the matching invariant either way).
            let content = message;
            let isEncrypted = false;
            const isDm = !!channel?.isDm;
            const ephemeralMs = isDm
                ? (await trpc.dms.getEphemeral.query({ channelId })).ephemeralMs
                : null;

            if (ephemeralMs != null) {
                if (!hasPriv()) {
                    openDialog(Dialog.E2EE_PASSWORD);
                    return false;
                }
                if (
                    !e2eeContext?.peerPublicKey ||
                    e2eeContext.peerUserId === null ||
                    ownUserId === undefined
                ) {
                    toast.error(
                        'The other user must sign in once before ephemeral messages can be sent.'
                    );
                    return false;
                }
                try {
                    const key = await dmKey(
                        e2eeContext.peerPublicKey,
                        ownUserId,
                        e2eeContext.peerUserId
                    );
                    content = await seal(key, message);
                    isEncrypted = true;
                } catch (e) {
                    console.error('e2ee seal failed', e);
                    toast.error('Could not encrypt message.');
                    return false;
                }
            }

            try {
                await trpc.messages.send.mutate({
                    content,
                    channelId,
                    isEncrypted,
                    files: files.map((f) => f.id),
                    ...(replyingTo ? { replyToMessageId: replyingTo.id } : {})
                });

                playSound(SoundType.MESSAGE_SENT);
            } catch (error) {
                toast.error(getTrpcError(error, 'Failed to send message'));
                return false;
            }

            setReplyingTo(null);
            setNewMessageHandler('');
            return true;
        },
        [
            channelId,
            sendTypingSignal,
            setNewMessageHandler,
            replyingTo,
            e2eeContext,
            ownUserId,
            channel?.isDm
        ]
    );

    if (!channelCan(ChannelPermission.VIEW_CHANNEL) || loading) {
        return <TextSkeleton />;
    }

    return (
        <>
            {fetching && (
                <div className="absolute top-0 left-0 right-0 h-12 z-10 flex items-center justify-center">
                    <div className="flex items-center gap-2 bg-background/80 backdrop-blur-sm border border-border rounded-full px-4 py-2 shadow-lg">
                        <Spinner size="xs" />
                        <span className="text-sm text-muted-foreground">
                            Fetching older messages...
                        </span>
                    </div>
                </div>
            )}

            <TextTopbar
                onScrollToMessage={scrollToMessage}
                channelId={channelId}
                whiteboardOpen={whiteboardOpen}
                onToggleWhiteboard={() => setWhiteboardOpen((prev) => !prev)}
            />

            <div className="flex flex-1 min-h-0">
                <div className="flex flex-col flex-1 min-w-0">
                    <div
                        ref={containerRef}
                        onScroll={onScroll}
                        data-messages-container
                        className="flex-1 overflow-y-auto overflow-x-hidden p-2 animate-in fade-in duration-500"
                    >
                        <div className="space-y-4">
                            {groupedMessages.map((group, index) => (
                                <MessagesGroup
                                    key={index}
                                    group={group}
                                    onReply={onReply}
                                    onScrollToMessage={scrollToMessage}
                                />
                            ))}
                        </div>
                    </div>

                    {replyingTo && (
                        <div className="flex items-center gap-2 px-4 py-2 border-t border-border bg-secondary/30 text-sm">
                            <span className="text-muted-foreground">
                                Replying to
                            </span>
                            <span className="font-medium truncate">
                                {replyingToPreview
                                    ? replyingToPreview
                                          .replace(/<[^>]*>/g, '')
                                          .slice(0, 80)
                                    : 'a message'}
                            </span>
                            <button
                                type="button"
                                onClick={() => setReplyingTo(null)}
                                className="ml-auto shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                    <MessageCompose
                        ref={composeRef}
                        channelId={channelId}
                        message={newMessage}
                        onMessageChange={setNewMessageHandler}
                        onSend={onSend}
                        onTyping={sendTypingSignal}
                        typingUsers={typingUsers}
                        users={mentionUsers}
                    />
                </div>

                {!channel?.isDm && (
                    <ResizableSidebar
                        storageKey={LocalStorageKey.WHITEBOARD_SIDEBAR_WIDTH}
                        minWidth={300}
                        maxWidth={900}
                        defaultWidth={500}
                        edge="left"
                        isOpen={whiteboardOpen}
                    >
                        <WhiteboardPanel
                            channelId={channelId}
                            onClose={() => setWhiteboardOpen(false)}
                        />
                    </ResizableSidebar>
                )}
            </div>
        </>
    );
});

export { TextChannel };
