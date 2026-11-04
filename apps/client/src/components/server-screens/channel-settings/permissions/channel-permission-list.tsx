import { PermissionToggleRow } from '@/components/permission-toggle-row';
import {
    ChannelPermission,
    channelPermissionDescriptions,
    channelPermissionLabels,
    ChannelType
} from '@caesar/shared';
import { memo, useMemo } from 'react';

// Voice-only and text-only permissions don't apply to the other channel
// type. SEND_MESSAGES is meaningless in a voice channel; JOIN / SPEAK /
// SHARE_SCREEN / WEBCAM are meaningless in a text channel.
const PERMISSIONS_BY_CHANNEL_TYPE: Record<ChannelType, ChannelPermission[]> = {
    [ChannelType.TEXT]: [
        ChannelPermission.VIEW_CHANNEL,
        ChannelPermission.SEND_MESSAGES
    ],
    [ChannelType.VOICE]: [
        ChannelPermission.VIEW_CHANNEL,
        ChannelPermission.JOIN,
        ChannelPermission.SPEAK,
        ChannelPermission.SHARE_SCREEN,
        ChannelPermission.WEBCAM
    ]
};

type TChannelPermissionListProps = {
    permissions: Array<{ permission: string; allow: boolean }>;
    channelType: ChannelType;
    onTogglePermission: (permission: ChannelPermission, allow: boolean) => void;
};

const ChannelPermissionList = memo(
    ({
        permissions,
        channelType,
        onTogglePermission
    }: TChannelPermissionListProps) => {
        const permissionsMap = useMemo(() => {
            const map = new Map<string, boolean>();
            permissions.forEach((perm) => {
                map.set(perm.permission, perm.allow);
            });
            return map;
        }, [permissions]);

        return (
            <div className="space-y-4">
                <h3 className="text-sm font-semibold">Channel Permissions</h3>

                <div className="space-y-3">
                    {PERMISSIONS_BY_CHANNEL_TYPE[channelType].map(
                        (permission) => (
                            <PermissionToggleRow
                                key={permission}
                                permission={permission}
                                label={channelPermissionLabels[permission]}
                                description={
                                    channelPermissionDescriptions[permission]
                                }
                                enabled={
                                    permissionsMap.get(permission) ?? false
                                }
                                onToggle={onTogglePermission}
                            />
                        )
                    )}
                </div>
            </div>
        );
    }
);

export { ChannelPermissionList };
