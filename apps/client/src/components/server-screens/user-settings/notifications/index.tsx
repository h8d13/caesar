import {
    setBrowserNotifications,
    setBrowserNotificationsForDms,
    setBrowserNotificationsForMentions
} from '@/features/app/actions';
import {
    useBrowserNotifications,
    useBrowserNotificationsForDms,
    useBrowserNotificationsForMentions
} from '@/features/app/hooks';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Group,
    Switch
} from '@caesar/ui';
import { memo } from 'react';

const Notifications = memo(() => {
    const browserNotifications = useBrowserNotifications();
    const browserNotificationsForMentions =
        useBrowserNotificationsForMentions();
    const browserNotificationsForDms = useBrowserNotificationsForDms();

    return (
        <Card>
            <CardHeader>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>
                    Control which messages trigger browser notifications.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Group
                    label="Browser Notifications"
                    description="Recieve browser notifications for all new messages."
                >
                    <Switch
                        checked={browserNotifications}
                        onCheckedChange={(value) =>
                            setBrowserNotifications(value)
                        }
                    />
                </Group>
                <Group
                    label="Notifications for Mentions Only"
                    description="Recieve browser notifications for messages that mention you. This setting is ignored if 'Browser Notifications' is enabled."
                >
                    <Switch
                        checked={browserNotificationsForMentions}
                        onCheckedChange={(value) =>
                            setBrowserNotificationsForMentions(value)
                        }
                    />
                </Group>
                <Group
                    label="Notifications for DMs Only"
                    description="Recieve browser notifications for new direct messages. This setting is ignored if 'Browser Notifications' is enabled."
                >
                    <Switch
                        checked={browserNotificationsForDms}
                        onCheckedChange={(value) =>
                            setBrowserNotificationsForDms(value)
                        }
                    />
                </Group>
            </CardContent>
        </Card>
    );
});

export { Notifications };
