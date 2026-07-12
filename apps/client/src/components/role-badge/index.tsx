import type { TRole } from '@caesar/shared';
import { Badge, IconButton } from '@caesar/ui';
import { X } from 'lucide-react';
import { memo } from 'react';

type TRoleBadgeProps = {
    role: Pick<TRole, 'id' | 'name' | 'color'>;
    onRemoveRole?: (roleId: number, roleName: string) => void;
};

const RoleBadge = memo(({ role, onRemoveRole }: TRoleBadgeProps) => {
    // clamp lightness into the theme's readable band so white/black
    // roles stay visible on both themes, hue untouched
    const readableColor = `oklch(from ${role.color} clamp(var(--role-color-l-min), l, var(--role-color-l-max)) c h)`;

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
