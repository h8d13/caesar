import { Protect } from '@/components/protect';
import { setModViewOpen } from '@/features/app/actions';
import { requestTextInput } from '@/features/dialogs/actions';
import { useUserById, useUsers } from '@/features/server/users/hooks';
import { getRenderedUsername } from '@/helpers/get-rendered-username';
import { getTRPCClient } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { getTrpcError, Permission } from '@caesar/shared';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    IconButton,
    Tooltip
} from '@caesar/ui';
import { format, formatDistanceToNow } from 'date-fns';
import {
    ArrowUpRight,
    Calendar,
    ClipboardList,
    Clock,
    Eye,
    EyeClosed,
    Gavel,
    IdCard,
    Network,
    Pencil,
    UserPlus,
    Users
} from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useModViewContext } from '../context';

const iconButtonClass =
    'text-muted-foreground inline-flex h-6 w-6 items-center justify-center rounded bg-transparent hover:bg-accent hover:text-foreground cursor-pointer transition-colors focus:outline-none';

type TRowProps = {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    details?: string;
    hidden?: boolean;
};

const Row = memo(
    ({ icon, label, value, details, hidden = false }: TRowProps) => {
        const [visible, setVisible] = useState(!hidden);

        let valContent = (
            <span className="text-sm text-muted-foreground truncate max-w-[160px]">
                {visible ? value : '***'}
            </span>
        );

        if (details) {
            valContent = <Tooltip content={details}>{valContent}</Tooltip>;
        }

        return (
            <div className="flex items-center justify-between py-1.5 px-1 gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    {icon}
                    <span className="text-sm truncate">{label}</span>
                </div>
                {valContent}
                {hidden && (
                    <IconButton
                        role="button"
                        onClick={() => setVisible(!visible)}
                        className={iconButtonClass}
                        icon={visible ? EyeClosed : Eye}
                    />
                )}
            </div>
        );
    }
);

const Details = memo(() => {
    const { user, lastLoginIp, inviteeIds, refetch } = useModViewContext();
    const inviter = useUserById(user.invitedBy ?? -1);
    const users = useUsers();

    const inviteeNames = useMemo(
        () =>
            inviteeIds
                .map((id) => {
                    const invitee = users.find((u) => u.id === id);

                    return invitee ? getRenderedUsername(invitee) : `#${id}`;
                })
                .join(', '),
        [inviteeIds, users]
    );

    const onRenameIdentity = useCallback(async () => {
        const next = await requestTextInput({
            title: 'Rename identity',
            message: `Current: ${user.identity}. New identity must start with a letter or digit (letters, digits, _, - only). The user will be signed out and must use the new identity to log back in.`,
            confirmLabel: 'Rename'
        });

        if (!next) return;

        try {
            await getTRPCClient().users.renameIdentity.mutate({
                userId: user.id,
                identity: next
            });
            toast.success('Identity updated');
            refetch();
        } catch (error) {
            toast.error(getTrpcError(error, 'Could not rename identity'));
        }
    }, [user.id, user.identity, refetch]);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5" />
                    Details
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
                <div className="space-y-2">
                    <Row
                        icon={
                            <IdCard className="h-4 w-4 text-muted-foreground" />
                        }
                        label="User ID"
                        value={user.id}
                    />

                    <Protect permission={Permission.VIEW_USER_SENSITIVE_DATA}>
                        <div className="flex items-center">
                            <div className="flex-1">
                                <Row
                                    icon={
                                        <IdCard className="h-4 w-4 text-muted-foreground" />
                                    }
                                    label="Identity"
                                    value={user.identity}
                                    hidden
                                />
                            </div>
                            <Protect permission={Permission.MANAGE_USERS}>
                                <Tooltip content="Rename identity">
                                    <IconButton
                                        role="button"
                                        onClick={onRenameIdentity}
                                        className={cn(iconButtonClass, 'ml-1')}
                                        icon={Pencil}
                                    />
                                </Tooltip>
                            </Protect>
                        </div>

                        <Row
                            icon={
                                <Network className="h-4 w-4 text-muted-foreground" />
                            }
                            label="Client hash"
                            value={lastLoginIp || 'Unknown'}
                            hidden
                        />
                    </Protect>

                    <div className="flex items-center">
                        <div className="flex-1">
                            <Row
                                icon={
                                    <UserPlus className="h-4 w-4 text-muted-foreground" />
                                }
                                label="Invited by"
                                value={
                                    inviter
                                        ? getRenderedUsername(inviter)
                                        : 'Unknown'
                                }
                            />
                        </div>
                        {inviter && (
                            <Tooltip content="Open inviter">
                                <IconButton
                                    role="button"
                                    onClick={() =>
                                        setModViewOpen(true, inviter.id)
                                    }
                                    className={cn(iconButtonClass, 'ml-1')}
                                    icon={ArrowUpRight}
                                />
                            </Tooltip>
                        )}
                    </div>

                    <Row
                        icon={
                            <Users className="h-4 w-4 text-muted-foreground" />
                        }
                        label="Invited"
                        value={inviteeIds.length}
                        details={inviteeNames || undefined}
                    />

                    <Row
                        icon={
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                        }
                        label="Joined Server"
                        value={formatDistanceToNow(user.createdAt, {
                            addSuffix: true
                        })}
                    />

                    <Row
                        icon={
                            <Clock className="h-4 w-4 text-muted-foreground" />
                        }
                        label="Last Active"
                        value={formatDistanceToNow(user.lastLoginAt, {
                            addSuffix: true
                        })}
                    />

                    {user.banned && (
                        <>
                            <Row
                                icon={
                                    <Gavel className="h-4 w-4 text-muted-foreground" />
                                }
                                label="Banned"
                                value="Yes"
                            />

                            <Row
                                icon={
                                    <Gavel className="h-4 w-4 text-muted-foreground" />
                                }
                                label="Ban Reason"
                                value={user.banReason || 'No reason provided'}
                            />

                            <Row
                                icon={
                                    <Gavel className="h-4 w-4 text-muted-foreground" />
                                }
                                label="Banned At"
                                value={format(user.bannedAt ?? 0, 'PPP')}
                                details={format(user.bannedAt ?? 0, 'PPpp')}
                            />
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
});

export { Details };
