import { useUserById } from '@/features/server/users/hooks';
import { getFileUrl } from '@/helpers/get-file-url';
import { getInitialsFromName } from '@/helpers/get-initials-from-name';
import { getRenderedUsername } from '@/helpers/get-rendered-username';
import { cn } from '@/lib/utils';
import { UserStatus } from '@caesar/shared';
import { Avatar, AvatarFallback, AvatarImage } from '@caesar/ui';
import { memo, type MouseEvent } from 'react';
import { UserPopover } from '../user-popover';
import { UserStatusBadge } from '../user-status';
import { AddStatusButton } from './add-status-button';

type TUserAvatarProps = {
    userId: number;
    className?: string;
    showUserPopover?: boolean;
    showStatusBadge?: boolean;
    // renders the "+" add-status affordance. Only meaningful on the own
    // avatar; callers gate this themselves.
    showAddStatus?: boolean;
    onClick?: (e: MouseEvent) => void;
};

const UserAvatar = memo(
    ({
        userId,
        className,
        showUserPopover = false,
        showStatusBadge = true,
        showAddStatus = false,
        onClick
    }: TUserAvatarProps) => {
        const user = useUserById(userId);

        if (!user) return null;

        const hasStatus = (user.activeStatusCount ?? 0) > 0;

        const content = (
            <div className="relative w-fit h-fit" onClick={onClick}>
                <Avatar
                    className={cn(
                        'h-8 w-8',
                        hasStatus &&
                            'ring-2 ring-green-500 ring-offset-2 ring-offset-card',
                        className
                    )}
                >
                    <AvatarImage
                        src={getFileUrl(user.avatar)}
                        key={user.avatarId}
                    />
                    <AvatarFallback className="bg-muted text-xs">
                        {getInitialsFromName(getRenderedUsername(user, userId))}
                    </AvatarFallback>
                </Avatar>
                {showStatusBadge && (
                    <UserStatusBadge
                        status={user.status || UserStatus.OFFLINE}
                        className="absolute bottom-0 right-0"
                    />
                )}
                {showAddStatus && <AddStatusButton />}
            </div>
        );

        if (!showUserPopover) return content;

        return <UserPopover userId={userId}>{content}</UserPopover>;
    }
);

export { UserAvatar };
