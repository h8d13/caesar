import { requestConfirmation } from '@/features/dialogs/actions';
import {
    setAllowMultipleSessions,
    signOutOtherSessions
} from '@/features/server/users/actions';
import { useOwnPublicUser } from '@/features/server/users/hooks';
import {
    Button,
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

    const onSignOutOthers = useCallback(async () => {
        const confirmed = await requestConfirmation({
            title: 'Sign out other sessions?',
            message:
                'Every session of your account except this one will be disconnected and will need to sign in again.',
            confirmLabel: 'Sign out others',
            variant: 'danger'
        });

        if (!confirmed) return;

        try {
            await signOutOtherSessions();
            toast.success('Signed out other sessions');
        } catch {
            toast.error('Could not sign out other sessions');
        }
    }, []);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Sessions</CardTitle>
                <CardDescription>
                    By default, signing in on another device disconnects your
                    other sessions. Enable this to keep them alive.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <div
                    className="flex items-center gap-3 w-fit cursor-pointer"
                    onClick={onToggle}
                >
                    <Switch checked={enabled} />
                    <span className="text-sm font-medium">
                        Allow multiple sessions on this account
                    </span>
                </div>
                <Button
                    variant="outline"
                    className="w-fit text-destructive hover:text-destructive"
                    onClick={onSignOutOthers}
                >
                    Sign out other sessions
                </Button>
            </CardContent>
        </Card>
    );
});

export { MultiSessionToggle };
