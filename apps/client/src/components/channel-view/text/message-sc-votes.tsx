import { useOwnUserId } from '@/features/server/users/hooks';
import { getTRPCClient } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { getTrpcError, type TMessageScVote } from '@sharkord/shared';
import { Tooltip } from '@sharkord/ui';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { toast } from 'sonner';

type TMessageScVotesProps = {
    messageId: number;
    messageUserId: number;
    scVotes: TMessageScVote[];
};

const MessageScVotes = memo(
    ({ messageId, messageUserId, scVotes }: TMessageScVotesProps) => {
        const ownUserId = useOwnUserId();
        const isOwnMessage = ownUserId === messageUserId;

        const { score, ownVote } = useMemo(() => {
            let score = 0;
            let ownVote: number | null = null;

            for (const vote of scVotes) {
                score += vote.value;
                if (vote.voterId === ownUserId) {
                    ownVote = vote.value;
                }
            }

            return { score, ownVote };
        }, [scVotes, ownUserId]);

        const onVote = useCallback(
            async (type: 'upvote' | 'downvote') => {
                const trpc = getTRPCClient();

                try {
                    await trpc.messages.toggleScVote.mutate({
                        messageId,
                        type
                    });
                } catch (error) {
                    toast.error(getTrpcError(error, 'Failed to vote'));
                }
            },
            [messageId]
        );

        if (isOwnMessage && scVotes.length === 0) return null;

        return (
            <div className="flex items-center gap-0.5 select-none">
                <Tooltip
                    content={
                        isOwnMessage
                            ? "Can't vote on your own message"
                            : ownVote === 1
                              ? 'Remove upvote'
                              : 'Upvote (+1 SC)'
                    }
                >
                    <button
                        type="button"
                        disabled={isOwnMessage}
                        onClick={() => onVote('upvote')}
                        className={cn(
                            'p-0.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
                            ownVote === 1
                                ? 'text-green-500 bg-green-500/10'
                                : 'text-muted-foreground hover:text-green-500 hover:bg-green-500/10'
                        )}
                    >
                        <ChevronUp className="h-4 w-4" />
                    </button>
                </Tooltip>
                {score !== 0 && (
                    <span
                        className={cn(
                            'text-xs font-medium min-w-[1ch] text-center',
                            score > 0 && 'text-green-500',
                            score < 0 && 'text-red-500'
                        )}
                    >
                        {score > 0 ? `+${score}` : score}
                    </span>
                )}
                <Tooltip
                    content={
                        isOwnMessage
                            ? "Can't vote on your own message"
                            : ownVote === -1
                              ? 'Remove downvote'
                              : 'Downvote (-1 SC)'
                    }
                >
                    <button
                        type="button"
                        disabled={isOwnMessage}
                        onClick={() => onVote('downvote')}
                        className={cn(
                            'p-0.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
                            ownVote === -1
                                ? 'text-red-500 bg-red-500/10'
                                : 'text-muted-foreground hover:text-red-500 hover:bg-red-500/10'
                        )}
                    >
                        <ChevronDown className="h-4 w-4" />
                    </button>
                </Tooltip>
            </div>
        );
    }
);

export { MessageScVotes };
