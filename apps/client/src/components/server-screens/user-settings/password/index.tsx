import { SettingsFooterActions } from '@/components/server-screens/settings-footer-actions';
import { updatePassword as updatePasswordAction } from '@/features/server/users/actions';
import { useForm } from '@/hooks/use-form';
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
    const { setTrpcErrors, r, values } = useForm({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: ''
    });

    const updatePassword = useCallback(async () => {
        try {
            await updatePasswordAction(values);
            toast.success('Password updated!');
        } catch (error) {
            setTrpcErrors(error);
        }
    }, [values, setTrpcErrors]);

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
