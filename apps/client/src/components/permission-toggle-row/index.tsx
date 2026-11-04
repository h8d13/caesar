import { Switch } from '@caesar/ui';
import { memo } from 'react';

type TPermissionToggleRowProps<P extends string> = {
    permission: P;
    label: string;
    description: string;
    enabled: boolean;
    disabled?: boolean;
    // stable and keyed by permission: a toggle re-renders only its row
    onToggle: (permission: P, enabled: boolean) => void;
};

const PermissionToggleRowInner = <P extends string>({
    permission,
    label,
    description,
    enabled,
    disabled,
    onToggle
}: TPermissionToggleRowProps<P>) => (
    <div className="flex items-center justify-between">
        <div className="flex flex-col">
            <span className="text-sm font-medium">{label}</span>
            <span className="text-sm text-muted-foreground">{description}</span>
        </div>
        <Switch
            checked={enabled}
            onCheckedChange={(checked) => onToggle(permission, checked)}
            disabled={disabled}
        />
    </div>
);

// memo() drops the generic, cast keeps it for callers
const PermissionToggleRow = memo(
    PermissionToggleRowInner
) as typeof PermissionToggleRowInner;

export { PermissionToggleRow };
