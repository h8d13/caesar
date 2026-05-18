import { setAllowMultipleSessions } from '@/features/server/users/actions';
import { useOwnPublicUser } from '@/features/server/users/hooks';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Switch
} from '@caesar/ui';
import { memo, useCallback } from 'react';
import { toast } from 'sonner';

const MultiSessionToggle = memo(() => {
    const ownPublicUser = useOwnPublicUser();
    const enabled = ownPublicUser?.allowMultipleSessions ?? false;

    const onToggle = useCallback(async () => {
        try {
            await setAllowMultipleSessions(!enabled);
        } catch {
            toast.error('Could not update session preference');
        }
    }, [enabled]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Concurrent sessions</CardTitle>
                <CardDescription>
                    By default, signing in on another device disconnects your
                    other sessions. Enable this to keep them all alive.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div
                    className="flex items-center gap-3 w-fit cursor-pointer"
                    onClick={onToggle}
                >
                    <Switch checked={enabled} />
                    <span className="text-sm font-medium">
                        Allow multiple sessions on this account
                    </span>
                </div>
            </CardContent>
        </Card>
    );
});

export { MultiSessionToggle };
