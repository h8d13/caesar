import { useGitHubEmojis } from '@/components/emoji-picker/use-github-emojis';
import { isTextPresentation } from '@/components/tiptap-input/helpers';
import { useOwnUserId, useUsernames } from '@/features/server/users/hooks';
import { getFileUrl } from '@/helpers/get-file-url';
import { getTRPCClient } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import {
    getTrpcError,
    type TFile,
    type TJoinedMessageReaction
} from '@caesar/shared';
import { Button, Tooltip } from '@caesar/ui';
import { memo, useCallback, useMemo } from 'react';
import { toast } from 'sonner';

const MAX_REACTORS_PREVIEW = 4;

type TTooltipPreviewProps = {
    emojiName: string;
    emojiSlot: React.ReactNode;
    reacters: string;
};

const TooltipPreview = memo(
    ({ emojiName, emojiSlot, reacters }: TTooltipPreviewProps) => {
        return (
            <div className="flex items-center gap-2 max-w-xs wrap-break-word whitespace-pre-wrap text-sm">
                <div className="flex items-center flex-col">
                    {emojiSlot}
                    <span className="text-[8px]">:{emojiName}:</span>
                </div>
                <span className="text-xs">was reacted by {reacters}.</span>
            </div>
        );
    }
);

type TEmojiProps = {
    emoji: string;
    file: TFile | null;
    className?: string;
    nativeEmojiClassName?: string;
};

const Emoji = memo(
    ({ emoji, file, className, nativeEmojiClassName }: TEmojiProps) => {
        const gitHubEmojis = useGitHubEmojis();
        // a reaction carrying a file is a custom emoji: it wins even when
        // its name matches a built-in shortcode
        const gitHubEmoji = useMemo(
            () =>
                file
                    ? undefined
                    : gitHubEmojis?.find(
                          (e) =>
                              e.name === emoji || e.shortcodes.includes(emoji)
                      ),
            [gitHubEmojis, emoji, file]
        );

        const onError = useCallback(
            (e: React.SyntheticEvent<HTMLImageElement>) => {
                const target = e.target as HTMLImageElement;

                target.outerHTML = `<span class="text-xs text-muted-foreground">:${emoji}:</span>`;
            },
            [emoji]
        );

        const imgSrc = useMemo(
            () => gitHubEmoji?.fallbackImage ?? getFileUrl(file),
            [gitHubEmoji, file]
        );

        // until the dataset loads only custom emojis (file) can render; the
        // text form avoids a broken <img> that onError would rewrite
        if (!gitHubEmojis && !file) {
            return (
                <span className="text-xs text-muted-foreground">:{emoji}:</span>
            );
        }

        if (gitHubEmoji?.emoji && !isTextPresentation(gitHubEmoji.emoji)) {
            return (
                <span className={cn('text-sm', nativeEmojiClassName)}>
                    {gitHubEmoji.emoji}
                </span>
            );
        }

        return (
            <img
                src={imgSrc}
                alt={`:${emoji}:`}
                className={cn('w-5 h-5 object-contain', className)}
                onError={onError}
            />
        );
    }
);

type TReactionProps = {
    emoji: string;
    count: number;
    isUserReacted: boolean;
    onClick: () => void;
    file: TFile | null;
    userIds: number[];
};

const Reaction = memo(
    ({
        emoji,
        count,
        isUserReacted,
        onClick,
        file,
        userIds
    }: TReactionProps) => {
        const usernames = useUsernames();
        const tooltipContent = useMemo(() => {
            const names = userIds
                .slice(0, MAX_REACTORS_PREVIEW)
                .map((userId) => usernames[userId] || 'Unknown');

            if (userIds.length > MAX_REACTORS_PREVIEW) {
                names.push(`and ${userIds.length - MAX_REACTORS_PREVIEW} more`);
            }

            return names.join(', ');
        }, [userIds, usernames]);

        return (
            <Tooltip
                content={
                    <TooltipPreview
                        emojiName={emoji}
                        reacters={tooltipContent}
                        emojiSlot={
                            <Emoji
                                emoji={emoji}
                                file={file}
                                className="w-10 h-10"
                                nativeEmojiClassName="text-[28px]"
                            />
                        }
                    />
                }
            >
                <Button
                    size="sm"
                    variant="outline"
                    onClick={onClick}
                    className={cn(
                        'flex items-center gap-1 h-9',
                        isUserReacted ? 'border-border' : 'border-none'
                    )}
                >
                    <Emoji emoji={emoji} file={file} />
                    <span className="font-medium">{count}</span>
                </Button>
            </Tooltip>
        );
    }
);

type TMessageReactionsProps = {
    messageId: number;
    reactions: TJoinedMessageReaction[];
};

type TAggregatedReaction = {
    emoji: string;
    count: number;
    userIds: number[];
    isUserReacted: boolean;
    file: TFile | null;
};

const MessageReactions = memo(
    ({ messageId, reactions }: TMessageReactionsProps) => {
        const ownUserId = useOwnUserId();

        const handleReactionClick = useCallback(
            async (emoji: string) => {
                if (!ownUserId) return;

                const trpc = getTRPCClient();

                try {
                    await trpc.messages.toggleReaction.mutate({
                        messageId,
                        emoji
                    });
                } catch (error) {
                    toast.error(
                        getTrpcError(error, 'Failed to toggle reaction')
                    );
                }
            },
            [messageId, ownUserId]
        );

        const aggregatedReactions = useMemo((): TAggregatedReaction[] => {
            const reactionMap = new Map<string, TAggregatedReaction>();

            reactions.forEach((reaction) => {
                if (!reactionMap.has(reaction.emoji)) {
                    reactionMap.set(reaction.emoji, {
                        emoji: reaction.emoji,
                        count: 0,
                        userIds: [],
                        isUserReacted: false,
                        file: reaction.file
                    });
                }

                const aggregated = reactionMap.get(reaction.emoji)!;

                aggregated.count++;
                aggregated.userIds.push(reaction.userId);

                if (ownUserId && reaction.userId === ownUserId) {
                    aggregated.isUserReacted = true;
                }
            });

            // first-appearance order: pills stay put as reactions are added
            return Array.from(reactionMap.values());
        }, [reactions, ownUserId]);

        if (!aggregatedReactions.length) return null;

        return (
            <div className="flex flex-wrap gap-1">
                {aggregatedReactions.map((reaction) => (
                    <Reaction
                        key={reaction.emoji}
                        emoji={reaction.emoji}
                        count={reaction.count}
                        userIds={reaction.userIds}
                        isUserReacted={reaction.isUserReacted}
                        onClick={() => handleReactionClick(reaction.emoji)}
                        file={reaction.file}
                    />
                ))}
            </div>
        );
    }
);

export { MessageReactions };
