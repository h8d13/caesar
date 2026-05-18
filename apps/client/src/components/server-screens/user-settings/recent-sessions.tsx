import { getTRPCClient } from '@/lib/trpc';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '@caesar/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { memo, useEffect } from 'react';

const formatRelative = (ts: number): string => {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60_000);

    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;

    const h = Math.floor(m / 60);

    if (h < 24) return `${h}h ago`;

    const d = Math.floor(h / 24);

    if (d < 30) return `${d}d ago`;

    return new Date(ts).toLocaleDateString();
};

const RecentSessions = memo(() => {
    const queryClient = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ['users', 'getMySessions'],
        queryFn: () => getTRPCClient().users.getMySessions.query()
    });

    // Live-update: server publishes USER_LOGIN_RECORDED to the user's own
    // subscriber when a new logins row is inserted. Re-fetch on receipt.
    useEffect(() => {
        const sub = getTRPCClient().users.onMyLogin.subscribe(undefined, {
            onData: () => {
                queryClient.invalidateQueries({
                    queryKey: ['users', 'getMySessions']
                });
            }
        });

        return () => sub.unsubscribe();
    }, [queryClient]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Recent sessions</CardTitle>
                <CardDescription>
                    Last 10 sign-ins on your account. Each row shows fingerprint
                    of the client (same browser produces the same hash) and when
                    it happened.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading && (
                    <span className="text-sm text-muted-foreground">
                        Loading...
                    </span>
                )}
                {!isLoading && (!data || data.length === 0) && (
                    <span className="text-sm text-muted-foreground">
                        No recorded sessions yet.
                    </span>
                )}
                {!isLoading && data && data.length > 0 && (
                    <ul className="flex flex-col gap-1">
                        {data.map((session, i) => (
                            <li
                                key={`${session.hash}-${session.createdAt}-${i}`}
                                className="flex items-center justify-between text-sm"
                            >
                                <span className="font-mono text-muted-foreground">
                                    {session.hash}
                                </span>
                                <span className="text-muted-foreground">
                                    {formatRelative(session.createdAt)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
});

export { RecentSessions };
