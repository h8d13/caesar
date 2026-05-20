import { Tabs, TabsContent, TabsList, TabsTrigger } from '@caesar/ui';
import { memo } from 'react';
import type { TServerScreenBaseProps } from '../screens';
import { ServerScreenLayout } from '../server-screen-layout';
import { DeleteAccount } from './delete-account';
import { Devices } from './devices';
import { MultiSessionToggle } from './multi-session-toggle';
import { Notifications } from './notifications';
import { Password } from './password';
import { Profile } from './profile';
import { RecentSessions } from './recent-sessions';

type TUserSettingsProps = TServerScreenBaseProps;

const UserSettings = memo(({ close }: TUserSettingsProps) => {
    return (
        <ServerScreenLayout close={close} title="User Settings">
            <div className="mx-auto max-w-4xl">
                <Tabs defaultValue="devices" className="w-full">
                    <TabsList className="mb-6">
                        <TabsTrigger value="devices">Devices</TabsTrigger>
                        <TabsTrigger value="profile">Profile</TabsTrigger>
                        <TabsTrigger value="notifications">
                            Notifications
                        </TabsTrigger>
                        <TabsTrigger value="security">Security</TabsTrigger>
                    </TabsList>

                    <TabsContent value="devices" className="space-y-6">
                        <Devices />
                    </TabsContent>
                    <TabsContent value="profile" className="space-y-6">
                        <Profile />
                    </TabsContent>
                    <TabsContent value="notifications" className="space-y-6">
                        <Notifications />
                    </TabsContent>
                    <TabsContent value="security" className="space-y-6">
                        <MultiSessionToggle />
                        <RecentSessions />
                        <Password />
                        <DeleteAccount />
                    </TabsContent>
                </Tabs>
            </div>
        </ServerScreenLayout>
    );
});

export { UserSettings };
