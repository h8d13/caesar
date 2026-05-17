import {
    ChannelPermission,
    channelPermissionDescriptions,
    channelPermissionLabels,
    ChannelType
} from '@caesar/shared';
import { Switch } from '@caesar/ui';
import { memo, useCallback, useMemo } from 'react';

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

type TChannelPermissionItemProps = {
    permission: ChannelPermission;
    enabled: boolean;
    onChange: (enabled: boolean) => void;
};

const ChannelPermissionItem = memo(
    ({ permission, enabled, onChange }: TChannelPermissionItemProps) => {
        return (
            <div className="flex items-center justify-between">
                <div className="flex flex-col">
                    <span className="text-sm font-medium">
                        {channelPermissionLabels[permission]}
                    </span>
                    <span className="text-sm text-muted-foreground">
                        {channelPermissionDescriptions[permission]}
                    </span>
                </div>
                <Switch checked={enabled} onCheckedChange={onChange} />
            </div>
        );
    }
);

type TChannelPermissionListProps = {
    permissions: Array<{ permission: string; allow: boolean }>;
    channelType: ChannelType;
    onTogglePermission: (permission: ChannelPermission) => void;
};

const ChannelPermissionList = memo(
    ({
        permissions,
        channelType,
        onTogglePermission
    }: TChannelPermissionListProps) => {
        // Convert permissions array to a map for quick lookup
        const permissionsMap = useMemo(() => {
            const map = new Map<string, boolean>();
            permissions.forEach((perm) => {
                map.set(perm.permission, perm.allow);
            });
            return map;
        }, [permissions]);

        const handleToggle = useCallback(
            (permission: ChannelPermission) => {
                onTogglePermission(permission);
            },
            [onTogglePermission]
        );

        return (
            <div className="space-y-4">
                <h3 className="text-sm font-semibold">Channel Permissions</h3>

                <div className="space-y-3">
                    {PERMISSIONS_BY_CHANNEL_TYPE[channelType].map(
                        (permission) => (
                            <ChannelPermissionItem
                                key={permission}
                                permission={permission}
                                enabled={
                                    permissionsMap.get(permission) ?? false
                                }
                                onChange={() => handleToggle(permission)}
                            />
                        )
                    )}
                </div>
            </div>
        );
    }
);

export { ChannelPermissionList };
