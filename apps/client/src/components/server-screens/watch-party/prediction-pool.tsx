import { useOwnUser } from '@/features/server/users/hooks';
import { getTRPCClient } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { Button, Input } from '@caesar/ui';
import { Plus, Trophy, X } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

type TPoolOption = {
    id: number;
    label: string;
    total: number;
    backers: number;
};
type TPool = {
    id: number;
    creatorId: number;
    question: string;
    status: 'open' | 'resolved' | 'void';
    closesAt: number;
    challengeEndsAt: number | null;
    winningOptionId: number | null;
    createdAt: number;
    totalPot: number;
    options: TPoolOption[];
};
type TYourStake = { optionId: number; amount: number };
type TState = { pool: TPool | null; yourStakes: TYourStake[] };

const formatRemaining = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
};

const CreatePoolForm = memo(
    ({ onCreated }: { onCreated: (s: TState) => void }) => {
        const [question, setQuestion] = useState('');
        const [options, setOptions] = useState<string[]>(['Yes', 'No']);
        const [minutes, setMinutes] = useState(30);
        const [challenge, setChallenge] = useState(0);
        const [submitting, setSubmitting] = useState(false);

        const submit = useCallback(async () => {
            const opts = options.map((o) => o.trim()).filter(Boolean);
            if (!question.trim() || opts.length < 2) {
                toast.error('Add a question and at least 2 answers');
                return;
            }
            setSubmitting(true);
            try {
                const res = await getTRPCClient().prediction.create.mutate({
                    question: question.trim(),
                    options: opts,
                    durationMinutes: minutes,
                    challengeMinutes: challenge > 0 ? challenge : undefined
                });
                onCreated(res);
            } catch {
                toast.error('Could not open the pool');
            } finally {
                setSubmitting(false);
            }
        }, [question, options, minutes, challenge, onCreated]);

        return (
            <div className="flex flex-col gap-3">
                <Input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Will he die within 30 minutes?"
                />
                <div className="flex flex-col gap-2">
                    {options.map((opt, i) => (
                        <div key={i} className="flex gap-2">
                            <Input
                                value={opt}
                                onChange={(e) =>
                                    setOptions((o) =>
                                        o.map((x, j) =>
                                            j === i ? e.target.value : x
                                        )
                                    )
                                }
                                placeholder={`Answer ${i + 1}`}
                                className="flex-1"
                            />
                            {options.length > 2 && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                        setOptions((o) =>
                                            o.filter((_, j) => j !== i)
                                        )
                                    }
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    ))}
                    {options.length < 6 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="self-start text-muted-foreground"
                            onClick={() => setOptions((o) => [...o, ''])}
                        >
                            <Plus className="h-4 w-4" /> Add answer
                        </Button>
                    )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Betting window</span>
                    <Input
                        type="number"
                        min={1}
                        max={720}
                        value={minutes}
                        onChange={(e) =>
                            setMinutes(Number(e.target.value) || 1)
                        }
                        className="w-20"
                    />
                    <span>min</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Result window</span>
                    <Input
                        type="number"
                        min={0}
                        max={720}
                        value={challenge}
                        onChange={(e) =>
                            setChallenge(
                                Math.max(0, Number(e.target.value) || 0)
                            )
                        }
                        className="w-20"
                    />
                    <span>min (0 = resolve right after betting)</span>
                </div>
                <Button onClick={submit} disabled={submitting}>
                    Open pool
                </Button>
            </div>
        );
    }
);

const PredictionPool = memo(({ className }: { className?: string }) => {
    const ownUser = useOwnUser();
    const ownUserId = ownUser?.id;
    const balance = ownUser?.socialCredit ?? 0;

    const [state, setState] = useState<TState>({ pool: null, yourStakes: [] });
    const [now, setNow] = useState(Date.now());
    const [amount, setAmount] = useState(10);
    const [creating, setCreating] = useState(false);

    const { pool, yourStakes } = state;

    // Load current pool on open, then stay in sync via the broadcast.
    useEffect(() => {
        const trpc = getTRPCClient();
        let active = true;

        trpc.prediction.getState.query().then((s) => {
            if (active) setState(s);
        });

        const sub = trpc.prediction.onUpdate.subscribe(undefined, {
            // own per-option stakes only change on our own actions, so keep them
            onData: ({ pool }) => setState((prev) => ({ ...prev, pool })),
            onError: (err) => console.error('prediction.onUpdate error:', err)
        });

        return () => {
            active = false;
            sub.unsubscribe();
        };
    }, []);

    // Tick the clock while a pool is open so the countdown + lock update live.
    useEffect(() => {
        if (pool?.status !== 'open') return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [pool?.status]);

    const handleStake = useCallback(
        async (optionId: number) => {
            if (amount < 1) return;
            try {
                const res = await getTRPCClient().prediction.stake.mutate({
                    optionId,
                    amount
                });
                setState(res);
            } catch {
                toast.error('Could not place that stake');
            }
        },
        [amount]
    );

    const handleResolve = useCallback(async (winningOptionId: number) => {
        try {
            const res = await getTRPCClient().prediction.resolve.mutate({
                winningOptionId
            });
            setState(res);
        } catch {
            toast.error('Could not resolve the pool');
        }
    }, []);

    const handleCancel = useCallback(async () => {
        try {
            const res = await getTRPCClient().prediction.cancel.mutate();
            setState(res);
        } catch {
            toast.error('Could not cancel the pool');
        }
    }, []);

    const header = (
        <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Prediction pool</h3>
            <span className="text-xs text-muted-foreground">
                You:{' '}
                <span className="tabular-nums font-medium text-green-500">
                    {balance.toLocaleString()} SC
                </span>
            </span>
        </div>
    );

    if (!pool || pool.status === 'void' || creating) {
        return (
            <div className={cn('flex flex-col gap-4', className)}>
                {header}
                <CreatePoolForm
                    onCreated={(s) => {
                        setState(s);
                        setCreating(false);
                    }}
                />
            </div>
        );
    }

    const isCreator = ownUserId === pool.creatorId;
    // betting locks at closesAt; resolution unlocks there too (early-resolve is
    // allowed during the challenge window for outcomes that happen early).
    const locked = pool.status === 'open' && now >= pool.closesAt;
    const myOptionId = yourStakes[0]?.optionId ?? null;

    const phaseLabel =
        pool.status === 'resolved'
            ? 'Resolved'
            : now < pool.closesAt
              ? `Betting closes in ${formatRemaining(pool.closesAt - now)}`
              : pool.challengeEndsAt && now < pool.challengeEndsAt
                ? `Result window: ${formatRemaining(pool.challengeEndsAt - now)}`
                : 'Awaiting result';

    return (
        <div className={cn('flex flex-col gap-3 min-h-0', className)}>
            {header}
            <p className="text-sm font-medium">{pool.question}</p>

            <div className="text-xs text-muted-foreground">
                {phaseLabel}
                {' · '}
                <span className="tabular-nums">
                    {pool.totalPot.toLocaleString()} SC pot
                </span>
            </div>

            <div className="flex flex-col gap-2 overflow-auto">
                {pool.options.map((o) => {
                    const pct =
                        pool.totalPot > 0
                            ? Math.round((o.total / pool.totalPot) * 100)
                            : 0;
                    const mine = yourStakes.find((s) => s.optionId === o.id);
                    const isWinner =
                        pool.status === 'resolved' &&
                        pool.winningOptionId === o.id;
                    const canStakeHere =
                        pool.status === 'open' &&
                        !locked &&
                        (myOptionId === null || myOptionId === o.id);

                    return (
                        <div
                            key={o.id}
                            className={cn(
                                'relative rounded-md border border-border p-2 overflow-hidden',
                                isWinner && 'border-green-500 bg-green-500/10'
                            )}
                        >
                            <div
                                className="absolute inset-y-0 left-0 bg-primary/10"
                                style={{ width: `${pct}%` }}
                            />
                            <div className="relative flex items-center justify-between gap-2">
                                <span className="text-sm font-medium flex items-center gap-1">
                                    {isWinner && (
                                        <Trophy className="h-3.5 w-3.5 text-green-500" />
                                    )}
                                    {o.label}
                                </span>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                    {o.total.toLocaleString()} SC · {o.backers}
                                    {mine ? ` · you ${mine.amount}` : ''}
                                </span>
                            </div>
                            {canStakeHere && (
                                <div className="relative mt-2 flex justify-end">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleStake(o.id)}
                                    >
                                        Stake {amount}
                                    </Button>
                                </div>
                            )}
                            {isCreator && locked && (
                                <div className="relative mt-2 flex justify-end">
                                    <Button
                                        size="sm"
                                        onClick={() => handleResolve(o.id)}
                                    >
                                        Declare winner
                                    </Button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {pool.status === 'open' && !locked && myOptionId === null && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Stake</span>
                    <Input
                        type="number"
                        min={1}
                        value={amount}
                        onChange={(e) => setAmount(Number(e.target.value) || 1)}
                        className="w-24"
                    />
                    <span>SC, then pick an answer</span>
                </div>
            )}

            {isCreator && pool.status !== 'resolved' && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="self-start text-destructive"
                    onClick={handleCancel}
                >
                    Cancel & refund
                </Button>
            )}

            {pool.status === 'resolved' && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    onClick={() => setCreating(true)}
                >
                    New pool
                </Button>
            )}
        </div>
    );
});

export { PredictionPool };
