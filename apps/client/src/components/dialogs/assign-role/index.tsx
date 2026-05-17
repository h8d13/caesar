import { PermissionsList } from '@/components/permissions-list';
import { useRoles } from '@/features/server/roles/hooks';
import { useOwnUserId } from '@/features/server/users/hooks';
import { getTRPCClient } from '@/lib/trpc';
import { getTrpcError, type TJoinedUser } from '@caesar/shared';
import {
    Alert,
    AlertDescription,
    Group,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@caesar/ui';
import { Info } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DialogShell } from '../dialog-shell';
import type { TDialogBaseProps } from '../types';

type TAssignRoleDialogProps = TDialogBaseProps & {
    user: TJoinedUser;
    refetch: () => Promise<void>;
};

const AssignRoleDialog = memo(
    ({ isOpen, close, user, refetch }: TAssignRoleDialogProps) => {
        const ownUserId = useOwnUserId();
        const roles = useRoles();
        const [selectedRoleId, setSelectedRoleId] = useState<number>(0);
        const isOwnUser = ownUserId === user.id;

        // Filter out roles the user already has
        const availableRoles = useMemo(
            () => roles.filter((role) => !user.roleIds.includes(role.id)),
            [roles, user.roleIds]
        );

        const selectedRole = useMemo(
            () => roles.find((role) => role.id === selectedRoleId),
            [roles, selectedRoleId]
        );

        const onSubmit = useCallback(async () => {
            if (selectedRoleId === 0) {
                toast.error('Please select a role');
                return;
            }

            try {
                const trpc = getTRPCClient();

                await trpc.users.addRole.mutate({
                    userId: user.id,
                    roleId: selectedRoleId
                });

                toast.success('Role assigned successfully');
                close();
                refetch();
            } catch (error) {
                toast.error(getTrpcError(error, 'Failed to assign role'));
            }
        }, [user.id, selectedRoleId, close, refetch]);

        return (
            <DialogShell
                isOpen={isOpen}
                title={`Assign role to ${user.name}`}
                afterHeader={
                    <>
                        {isOwnUser && (
                            <Alert variant="default">
                                <Info />
                                <AlertDescription>
                                    You are assigning a role to yourself.
                                </AlertDescription>
                            </Alert>
                        )}
                        {availableRoles.length === 0 && (
                            <Alert variant="default">
                                <Info />
                                <AlertDescription>
                                    This user already has all available roles.
                                </AlertDescription>
                            </Alert>
                        )}
                    </>
                }
                confirmLabel="Assign Role"
                onCancel={close}
                onConfirm={onSubmit}
                confirmDisabled={
                    availableRoles.length === 0 || selectedRoleId === 0
                }
            >
                <div className="flex flex-col gap-4">
                    <Group label="Role">
                        <Select
                            onValueChange={(value) =>
                                setSelectedRoleId(Number(value))
                            }
                            value={selectedRoleId.toString()}
                            disabled={availableRoles.length === 0}
                        >
                            <SelectTrigger className="w-[230px]">
                                <SelectValue placeholder="Select a role" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableRoles.map((role) => (
                                    <SelectItem
                                        key={role.id}
                                        value={role.id.toString()}
                                    >
                                        {role.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Group>

                    {selectedRole && (
                        <PermissionsList
                            permissions={selectedRole.permissions}
                            variant="default"
                            size="md"
                        />
                    )}
                </div>
            </DialogShell>
        );
    }
);

export { AssignRoleDialog };
