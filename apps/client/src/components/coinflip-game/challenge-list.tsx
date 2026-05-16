import {
    acceptCoinflipChallenge,
    cancelCoinflipChallenge
} from '@/features/server/coinflip/actions';
import { useCoinflipChallenges } from '@/features/server/coinflip/hooks';
import { useOwnUserId } from '@/features/server/users/hooks';
import { CoinflipStatus } from '@caesar/shared/games/coinflip';
import { Button } from '@caesar/ui';
import { memo, useCallback, useState } from 'react';
import { toast } from 'sonner';

const ChallengeList = memo(() => {
    const challenges = useCoinflipChallenges();
    const ownUserId = useOwnUserId();
    const [loadingId, setLoadingId] = useState<number | null>(null);

    const handleAccept = useCallback(async (challengeId: number) => {
        setLoadingId(challengeId);
        try {
            await acceptCoinflipChallenge(challengeId);
        } catch (e) {
            toast.error(
                e instanceof Error ? e.message : 'Failed to accept challenge'
            );
        } finally {
            setLoadingId(null);
        }
    }, []);

    const handleCancel = useCallback(async (challengeId: number) => {
        setLoadingId(challengeId);
        try {
            await cancelCoinflipChallenge(challengeId);
        } catch (e) {
            toast.error(
                e instanceof Error ? e.message : 'Failed to cancel challenge'
            );
        } finally {
            setLoadingId(null);
        }
    }, []);

    if (challenges.length === 0) {
        return (
            <div className="px-4 text-xs text-muted-foreground">
                No active challenges
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1 px-4 overflow-auto">
            {challenges.map((challenge) => {
                const isCreator = challenge.creatorId === ownUserId;
                const isFlipping = challenge.status === CoinflipStatus.FLIPPING;
                const isResolved = challenge.status === CoinflipStatus.RESOLVED;
                const isPending = challenge.status === CoinflipStatus.PENDING;
                const isWinner = challenge.winnerId === ownUserId;

                return (
                    <div
                        key={challenge.id}
                        className="flex items-center justify-between text-sm py-2 px-3 rounded bg-muted/50"
                    >
                        <div className="flex flex-col gap-0.5 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="font-medium truncate">
                                    {challenge.creatorName}
                                </span>
                                <span className="text-xs text-muted-foreground capitalize shrink-0">
                                    {challenge.creatorSide}
                                </span>
                                <span className="text-xs font-bold tabular-nums text-yellow-500 shrink-0">
                                    {challenge.amount} SC
                                </span>
                            </div>
                            {isFlipping && (
                                <span className="text-xs text-yellow-500 animate-pulse">
                                    Flipping...
                                </span>
                            )}
                            {isResolved && challenge.result && (
                                <span className="text-xs">
                                    <span className="capitalize">
                                        {challenge.result}
                                    </span>
                                    {' — '}
                                    <span
                                        className={
                                            isWinner ||
                                            (!isCreator &&
                                                challenge.opponentId !==
                                                    ownUserId)
                                                ? 'text-green-400'
                                                : challenge.winnerId ===
                                                    challenge.creatorId
                                                  ? 'text-green-400'
                                                  : 'text-red-400'
                                        }
                                    >
                                        {challenge.winnerId ===
                                        challenge.creatorId
                                            ? challenge.creatorName
                                            : challenge.opponentName}{' '}
                                        wins!
                                    </span>
                                </span>
                            )}
                        </div>
                        <div className="shrink-0 ml-2">
                            {isPending && isCreator && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    disabled={loadingId === challenge.id}
                                    onClick={() => handleCancel(challenge.id)}
                                >
                                    Cancel
                                </Button>
                            )}
                            {isPending && !isCreator && (
                                <Button
                                    size="sm"
                                    className="h-7 text-xs"
                                    disabled={loadingId === challenge.id}
                                    onClick={() => handleAccept(challenge.id)}
                                >
                                    Accept
                                </Button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
});

export { ChallengeList };
