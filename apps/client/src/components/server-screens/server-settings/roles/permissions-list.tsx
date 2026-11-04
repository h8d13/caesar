import {
    Permission as EPermission,
    permissionDescriptions,
    permissionLabels
} from '@caesar/shared';
import { Switch } from '@caesar/ui';
import { memo } from 'react';

const availablePermissions = Object.values(EPermission);

type TToggle = (permission: EPermission, enabled: boolean) => void;

type TPermissionProps = {
    permission: EPermission;
    enabled: boolean;
    onToggle: TToggle;
    disabled?: boolean;
};

// onToggle is stable and takes the permission, so a toggle re-renders
// only the row whose `enabled` changed
const Permission = memo(
    ({ permission, enabled, onToggle, disabled }: TPermissionProps) => {
        return (
            <div className="flex items-center justify-between">
                <div className="flex flex-col">
                    <span className="text-sm font-medium">
                        {permissionLabels[permission]}
                    </span>
                    <span className="text-sm text-muted-foreground">
                        {permissionDescriptions[permission]}
                    </span>
                </div>
                <Switch
                    checked={enabled}
                    onCheckedChange={(checked) => onToggle(permission, checked)}
                    disabled={disabled}
                />
            </div>
        );
    }
);

type TPermissionListProps = {
    permissions: EPermission[];
    onToggle: TToggle;
    disabled?: boolean;
};

const PermissionList = memo(
    ({ permissions, onToggle, disabled }: TPermissionListProps) => {
        return (
            <div className="space-y-4">
                <h3 className="text-sm font-semibold">Permissions</h3>

                <div className="space-y-3">
                    {availablePermissions.map((permission) => (
                        <Permission
                            key={permission}
                            permission={permission}
                            enabled={permissions.includes(permission)}
                            onToggle={onToggle}
                            disabled={disabled}
                        />
                    ))}
                </div>
            </div>
        );
    }
);

export { PermissionList };
