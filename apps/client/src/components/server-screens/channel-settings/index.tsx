import { useCan } from '@/features/server/hooks';
import { Permission } from '@caesar/shared';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@caesar/ui';
import { memo } from 'react';
import type { TServerScreenBaseProps } from '../screens';
import { ServerScreenLayout } from '../server-screen-layout';
import { General } from './general';
import { ChannelPermissions } from './permissions';
import { Security } from './security';

type TChannelSettingsProps = TServerScreenBaseProps & {
    channelId: number;
};

const ChannelSettings = memo(({ close, channelId }: TChannelSettingsProps) => {
    const can = useCan();
    // general and security hit MANAGE_CHANNELS routes, permissions its own
    const canManageChannels = can(Permission.MANAGE_CHANNELS);
    const canManagePermissions = can(Permission.MANAGE_CHANNEL_PERMISSIONS);

    return (
        <ServerScreenLayout close={close} title="Channel Settings">
            <div className="mx-auto max-w-4xl">
                <Tabs
                    defaultValue={canManageChannels ? 'general' : 'permissions'}
                    className="w-full"
                >
                    <TabsList className="mb-6">
                        {canManageChannels && (
                            <TabsTrigger value="general">General</TabsTrigger>
                        )}
                        {canManagePermissions && (
                            <TabsTrigger value="permissions">
                                Permissions
                            </TabsTrigger>
                        )}
                        {canManageChannels && (
                            <TabsTrigger value="security">Security</TabsTrigger>
                        )}
                    </TabsList>

                    {canManageChannels && (
                        <TabsContent value="general" className="space-y-6">
                            <General channelId={channelId} />
                        </TabsContent>
                    )}
                    {canManagePermissions && (
                        <TabsContent value="permissions" className="space-y-6">
                            <ChannelPermissions channelId={channelId} />
                        </TabsContent>
                    )}
                    {canManageChannels && (
                        <TabsContent value="security" className="space-y-6">
                            <Security channelId={channelId} />
                        </TabsContent>
                    )}
                </Tabs>
            </div>
        </ServerScreenLayout>
    );
});

export { ChannelSettings };
