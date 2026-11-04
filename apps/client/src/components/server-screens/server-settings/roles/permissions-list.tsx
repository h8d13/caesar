import { PermissionToggleRow } from '@/components/permission-toggle-row';
import {
    Permission as EPermission,
    permissionDescriptions,
    permissionLabels
} from '@caesar/shared';
import { memo } from 'react';

const availablePermissions = Object.values(EPermission);

type TToggle = (permission: EPermission, enabled: boolean) => void;

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
                        <PermissionToggleRow
                            key={permission}
                            permission={permission}
                            label={permissionLabels[permission]}
                            description={permissionDescriptions[permission]}
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
