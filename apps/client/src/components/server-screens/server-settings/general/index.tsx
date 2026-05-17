import { SettingsFooterActions } from '@/components/server-screens/settings-footer-actions';
import { useAdminGeneral } from '@/features/server/admin/hooks';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Group,
    Input,
    LoadingCard,
    Switch,
    Textarea
} from '@caesar/ui';
import { memo } from 'react';
import { LogoManager } from './logo-manager';

const General = memo(() => {
    const { settings, logo, loading, onChange, submit, errors, refetch } =
        useAdminGeneral();

    if (loading) {
        return <LoadingCard className="h-[600px]" />;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Server Information</CardTitle>
                <CardDescription>
                    Manage your server's basic information
                </CardDescription>
                <SettingsFooterActions onSave={submit} loading={loading} />
            </CardHeader>
            <CardContent className="space-y-4">
                <Group label="Name">
                    <Input
                        value={settings.name}
                        onChange={(e) => onChange('name', e.target.value)}
                        placeholder="Enter server name"
                        error={errors.name}
                    />
                </Group>

                <Group label="Description">
                    <Textarea
                        value={settings.description}
                        onChange={(e) =>
                            onChange('description', e.target.value)
                        }
                        placeholder="Enter server description"
                        rows={4}
                    />
                </Group>

                <Group label="Password">
                    <Input
                        type="password"
                        value={settings.password}
                        onChange={(e) => onChange('password', e.target.value)}
                        placeholder="Leave empty for no password"
                        error={errors.password}
                    />
                </Group>

                <LogoManager logo={logo} refetch={refetch} />

                <Group
                    label="Enable Direct Messages"
                    description="Allow users to send direct messages to each other. If disabled, users can only communicate in channels."
                >
                    <Switch
                        checked={settings.directMessagesEnabled}
                        onCheckedChange={(checked) =>
                            onChange('directMessagesEnabled', checked)
                        }
                    />
                </Group>
            </CardContent>
        </Card>
    );
});

export { General };
