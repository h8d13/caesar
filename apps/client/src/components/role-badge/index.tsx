import { getReadableRoleColor } from '@/helpers/get-readable-role-color';
import type { TRole } from '@caesar/shared';
import { Badge, IconButton } from '@caesar/ui';
import { X } from 'lucide-react';
import { memo } from 'react';

type TRoleBadgeProps = {
    role: Pick<TRole, 'id' | 'name' | 'color'>;
    onRemoveRole?: (roleId: number, roleName: string) => void;
};

const RoleBadge = memo(({ role, onRemoveRole }: TRoleBadgeProps) => {
    const readableColor = getReadableRoleColor(role.color);

    return (
        <Badge
            style={{
                backgroundColor: role.color + '20',
                borderColor: readableColor
            }}
        >
            <span style={{ color: readableColor }}>{role.name}</span>
            {onRemoveRole && (
                <IconButton
                    icon={X}
                    size="xs"
                    aria-label={`Remove ${role.name} role`}
                    style={{ color: readableColor }}
                    onClick={() => onRemoveRole(role.id, role.name)}
                />
            )}
        </Badge>
    );
});

export { RoleBadge };
