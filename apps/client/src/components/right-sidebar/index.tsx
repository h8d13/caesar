import { ResizableSidebar } from '@/components/resizable-sidebar';
import { UserAvatar } from '@/components/user-avatar';
import {
    useSelectedChannelId,
    useSelectedChannelType
} from '@/features/server/channels/hooks';
import { useVoiceUsersByChannelId } from '@/features/server/hooks';
import { useUsers } from '@/features/server/users/hooks';
import { getRenderedUsername } from '@/helpers/get-rendered-username';
import { getSocialCreditColor } from '@/helpers/get-social-credit-color';
import { LocalStorageKey } from '@/helpers/storage';
import { cn } from '@/lib/utils';
import { ChannelType, DELETED_USER_IDENTITY_AND_NAME } from '@sharkord/shared';
import { memo, useMemo, useState } from 'react';
import { UserPopover } from '../user-popover';

const MAX_USERS_TO_SHOW = 100;
const MIN_WIDTH = 180;
const MAX_WIDTH = 360;
const DEFAULT_WIDTH = 240; // w-60 = 240px

type TUserProps = {
    userId: number;
    user: { name: string };
    banned: boolean;
    socialCredit: number;
};

const User = memo(({ userId, user, banned, socialCredit }: TUserProps) => {
    return (
        <UserPopover userId={userId}>
            <div className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-accent select-none min-w-0">
                <UserAvatar userId={userId} className="h-8 w-8 shrink-0" />
                <span
                    className={cn(
                        'text-sm truncate',
                        banned && 'line-through opacity-50'
                    )}
                    style={{
                        color: banned
                            ? undefined
                            : getSocialCreditColor(socialCredit)
                    }}
                >
                    {getRenderedUsername(user, userId)}
                </span>
            </div>
        </UserPopover>
    );
});

type TRightSidebarProps = {
    className?: string;
    isOpen?: boolean;
};

type TFilterMode = 'all' | 'channel';

const RightSidebar = memo(
    ({ className, isOpen = true }: TRightSidebarProps) => {
        const [filterMode, setFilterMode] = useState<TFilterMode>('all');
        const users = useUsers();
        const selectedChannelId = useSelectedChannelId();
        const selectedChannelType = useSelectedChannelType();
        const voiceUsers = useVoiceUsersByChannelId(selectedChannelId ?? -1);

        const isVoiceChannel = selectedChannelType === ChannelType.VOICE;

        const { usersToShow, usersCount } = useMemo(() => {
            if (isVoiceChannel && filterMode === 'channel') {
                const voiceUserIds = new Set(voiceUsers.map((vu) => vu.id));
                const filtered = users.filter(
                    (user) =>
                        user.name !== DELETED_USER_IDENTITY_AND_NAME &&
                        voiceUserIds.has(user.id)
                );

                return {
                    usersToShow: filtered.slice(0, MAX_USERS_TO_SHOW),
                    usersCount: filtered.length
                };
            }

            const filtered = users.filter(
                (user) => user.name !== DELETED_USER_IDENTITY_AND_NAME
            );

            return {
                usersToShow: filtered.slice(0, MAX_USERS_TO_SHOW),
                usersCount: filtered.length
            };
        }, [users, isVoiceChannel, filterMode, voiceUsers]);

        const hasHiddenUsers = usersToShow.length < usersCount;

        return (
            <ResizableSidebar
                storageKey={LocalStorageKey.RIGHT_SIDEBAR_WIDTH}
                minWidth={MIN_WIDTH}
                maxWidth={MAX_WIDTH}
                defaultWidth={DEFAULT_WIDTH}
                edge="left"
                isOpen={isOpen}
                className={cn('h-full', className)}
            >
                <div className="flex h-12 items-center border-b border-border px-4 justify-between">
                    <h3 className="text-sm font-semibold text-foreground">
                        Members — {usersCount}
                    </h3>
                    {isVoiceChannel && (
                        <div className="flex gap-1">
                            <button
                                onClick={() => setFilterMode('all')}
                                className={cn(
                                    'text-xs px-2 py-0.5 rounded transition-colors',
                                    filterMode === 'all'
                                        ? 'bg-accent text-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setFilterMode('channel')}
                                className={cn(
                                    'text-xs px-2 py-0.5 rounded transition-colors',
                                    filterMode === 'channel'
                                        ? 'bg-accent text-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                Channel
                            </button>
                        </div>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    <div className="space-y-1">
                        {usersToShow.map((user) => (
                            <User
                                key={user.id}
                                userId={user.id}
                                user={user}
                                banned={user.banned}
                                socialCredit={user.socialCredit ?? 0}
                            />
                        ))}
                        {hasHiddenUsers && (
                            <div className="text-sm text-muted-foreground px-2 py-1.5">
                                +{usersCount - usersToShow.length} more...
                            </div>
                        )}
                    </div>
                </div>
            </ResizableSidebar>
        );
    }
);

export { RightSidebar };
