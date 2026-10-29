import { SettingsFooterActions } from '@/components/server-screens/settings-footer-actions';
import { updatePassword as updatePasswordAction } from '@/features/server/users/actions';
import { useForm } from '@/hooks/use-form';
import {
    PASSWORD_LENGTH_ERROR,
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH
} from '@caesar/shared';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Group,
    Input
} from '@caesar/ui';
import { memo, useCallback } from 'react';
import { toast } from 'sonner';

const Password = memo(() => {
    const { setTrpcErrors, setError, r, values } = useForm({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: ''
    });

    const updatePassword = useCallback(async () => {
        // the server only sees authKeys, so it can't check these
        if (
            values.newPassword.length < PASSWORD_MIN_LENGTH ||
            values.newPassword.length > PASSWORD_MAX_LENGTH
        ) {
            setError('newPassword', PASSWORD_LENGTH_ERROR);
            return;
        }

        if (values.newPassword !== values.confirmNewPassword) {
            setError(
                'confirmNewPassword',
                'New password and confirmation do not match'
            );
            return;
        }

        try {
            await updatePasswordAction(values);
            toast.success('Password updated!');
        } catch (error) {
            setTrpcErrors(error);
        }
    }, [values, setTrpcErrors, setError]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Password</CardTitle>
                <CardDescription>
                    In this section, you can update your password.
                </CardDescription>
                <SettingsFooterActions
                    onSave={updatePassword}
                    loading={false}
                />
            </CardHeader>
            <CardContent className="space-y-4">
                <Group label="Current Password">
                    <Input {...r('currentPassword', 'password')} />
                </Group>

                <Group label="New Password">
                    <Input {...r('newPassword', 'password')} />
                </Group>

                <Group label="Confirm New Password">
                    <Input {...r('confirmNewPassword', 'password')} />
                </Group>
            </CardContent>
        </Card>
    );
});

export { Password };
