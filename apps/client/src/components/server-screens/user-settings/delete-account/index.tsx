import { requestConfirmation } from '@/features/dialogs/actions';
import { disconnectFromServer } from '@/features/server/actions';
import { useForm } from '@/hooks/use-form';
import { getTRPCClient } from '@/lib/trpc';
import {
    Alert,
    AlertDescription,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Group,
    Input,
    Switch
} from '@caesar/ui';
import { AlertCircleIcon } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { toast } from 'sonner';

const DeleteAccount = memo(() => {
    const { setTrpcErrors, r, values } = useForm({
        currentPassword: ''
    });
    const [wipe, setWipe] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const onDelete = useCallback(async () => {
        const confirmed = await requestConfirmation({
            title: 'Delete your account?',
            message: wipe
                ? 'This permanently deletes your account and wipes all your messages, emojis, reactions, and files. This cannot be undone.'
                : 'This permanently deletes your account. Your messages and uploads stay as "Deleted User". This cannot be undone.',
            confirmLabel: 'Delete account',
            variant: 'danger'
        });

        if (!confirmed) return;

        const trpc = getTRPCClient();

        try {
            setIsDeleting(true);
            await trpc.users.deleteSelf.mutate({
                currentPassword: values.currentPassword,
                wipe
            });
            toast.success('Account deleted');
            disconnectFromServer();
        } catch (error) {
            setTrpcErrors(error);
            setIsDeleting(false);
        }
    }, [values.currentPassword, wipe, setTrpcErrors]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Delete account</CardTitle>
                <CardDescription>
                    Permanently delete your account. This cannot be undone.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Group label="Current Password">
                    <Input {...r('currentPassword', 'password')} />
                </Group>

                <div
                    className="flex items-center gap-3 w-fit cursor-pointer"
                    onClick={() => setWipe((v) => !v)}
                >
                    <Switch checked={wipe} />
                    <span className="text-sm font-medium">
                        Also wipe my messages, reactions, emojis and files
                    </span>
                </div>

                {wipe ? (
                    <Alert variant="destructive" className="py-2">
                        <AlertCircleIcon className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                            Wipe mode removes your messages, emojis, reactions,
                            and files from the server entirely.
                        </AlertDescription>
                    </Alert>
                ) : (
                    <Alert variant="info" className="py-2">
                        <AlertCircleIcon className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                            Your account is removed but your messages and
                            uploads remain attributed to "Deleted User".
                        </AlertDescription>
                    </Alert>
                )}

                <Button
                    variant="destructive"
                    onClick={onDelete}
                    disabled={isDeleting || !values.currentPassword}
                >
                    {isDeleting ? 'Deleting...' : 'Delete my account'}
                </Button>
            </CardContent>
        </Card>
    );
});

export { DeleteAccount };
