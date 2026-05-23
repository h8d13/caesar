import { requestConfirmation } from '@/features/dialogs/actions';
import { useForm } from '@/hooks/use-form';
import { getTRPCClient } from '@/lib/trpc';
import {
    getTrpcError,
    OWNER_ROLE_ID,
    STORAGE_MAX_QUOTA_PER_USER,
    STORAGE_MIN_QUOTA_PER_USER,
    type TJoinedRole
} from '@caesar/shared';
import {
    Alert,
    AlertDescription,
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Label,
    Separator,
    Switch,
    Tooltip
} from '@caesar/ui';
import { filesize } from 'filesize';
import { Info, Star, Trash2 } from 'lucide-react';
import { memo, useCallback } from 'react';
import { toast } from 'sonner';
import { QUOTA_BY_USER_PRESETS } from '../storage/presets';
import { StorageSizeControl } from '../storage/storage-size-control';
import { PermissionList } from './permissions-list';

type TUpdateRoleProps = {
    selectedRole: TJoinedRole;
    setSelectedRoleId: (id: number | undefined) => void;
    refetch: () => void;
};

const UpdateRole = memo(
    ({ selectedRole, setSelectedRoleId, refetch }: TUpdateRoleProps) => {
        const { setTrpcErrors, r, onChange, values } = useForm({
            name: selectedRole.name,
            color: selectedRole.color,
            permissions: selectedRole.permissions,
            storageQuotaOverrideEnabled:
                selectedRole.storageQuotaOverrideEnabled,
            storageSpaceQuota: selectedRole.storageSpaceQuota
        });

        const isOwnerRole = selectedRole.id === OWNER_ROLE_ID;
        const storageQuotaLabel = filesize(
            Number(values.storageSpaceQuota ?? 0),
            {
                output: 'object',
                standard: 'jedec'
            }
        );

        const onDeleteRole = useCallback(async () => {
            const choice = await requestConfirmation({
                title: 'Delete Role',
                message: `Are you sure you want to delete this role? If there are members with this role, they will be moved to the default role. This action cannot be undone.`,
                confirmLabel: 'Delete'
            });

            if (!choice) return;

            const trpc = getTRPCClient();

            try {
                await trpc.roles.delete.mutate({ roleId: selectedRole.id });
                toast.success('Role deleted');
                refetch();
                setSelectedRoleId(undefined);
            } catch {
                toast.error('Failed to delete role');
            }
        }, [selectedRole.id, refetch, setSelectedRoleId]);

        const onUpdateRole = useCallback(async () => {
            const trpc = getTRPCClient();

            try {
                await trpc.roles.update.mutate({
                    roleId: selectedRole.id,
                    ...values
                });

                toast.success('Role updated');
                refetch();
            } catch (error) {
                setTrpcErrors(error);
            }
        }, [selectedRole.id, values, refetch, setTrpcErrors]);

        const onSetAsDefaultRole = useCallback(async () => {
            const choice = await requestConfirmation({
                title: 'Set as Default Role',
                message: `Are you sure you want to set this role as the default role? New members will be assigned this role upon joining.`,
                confirmLabel: 'Set as Default'
            });

            if (!choice) return;

            const trpc = getTRPCClient();

            try {
                await trpc.roles.setDefault.mutate({ roleId: selectedRole.id });

                toast.success('Default role updated');
                refetch();
            } catch (error) {
                toast.error(getTrpcError(error, 'Failed to set default role'));
            }
        }, [selectedRole.id, refetch]);

        return (
            <Card className="flex-1">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Edit Role</CardTitle>
                        <div>
                            <Tooltip content="Set as Default Role">
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    disabled={selectedRole.isDefault}
                                    onClick={onSetAsDefaultRole}
                                >
                                    <Star className="h-4 w-4" />
                                </Button>
                            </Tooltip>
                            <Button
                                size="icon"
                                variant="ghost"
                                disabled={
                                    selectedRole.isPersistent ||
                                    selectedRole.isDefault
                                }
                                onClick={onDeleteRole}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {selectedRole.isDefault && (
                        <Alert variant="default">
                            <Star />
                            <AlertDescription>
                                This is the default role. New members will be
                                assigned this role upon joining.
                            </AlertDescription>
                        </Alert>
                    )}

                    {isOwnerRole && (
                        <Alert variant="default">
                            <Info />
                            <AlertDescription>
                                This is the owner role. This role has all
                                permissions and cannot be deleted or have its
                                permissions changed.
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="role-name">Role Name</Label>
                            <Input id="role-name" {...r('name')} />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="role-color">Role Color</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="role-color"
                                    className="h-10 w-20"
                                    {...r('color', 'color')}
                                />
                                <Input className="flex-1" {...r('color')} />
                            </div>
                        </div>
                    </div>

                    <PermissionList
                        permissions={values.permissions}
                        disabled={OWNER_ROLE_ID === selectedRole.id}
                        setPermissions={(permissions) =>
                            onChange('permissions', permissions)
                        }
                    />

                    <Separator />

                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-4">
                            <div className="space-y-1">
                                <Label htmlFor="role-storage-override">
                                    Storage quota override
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                    Override the global storage quota for
                                    members with this role.
                                </p>
                            </div>
                            <Switch
                                id="role-storage-override"
                                checked={!!values.storageQuotaOverrideEnabled}
                                onCheckedChange={(checked) =>
                                    onChange(
                                        'storageQuotaOverrideEnabled',
                                        checked
                                    )
                                }
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Storage quota</Label>
                            <StorageSizeControl
                                value={Number(values.storageSpaceQuota)}
                                max={STORAGE_MAX_QUOTA_PER_USER}
                                min={STORAGE_MIN_QUOTA_PER_USER}
                                disabled={!values.storageQuotaOverrideEnabled}
                                onChange={(value) =>
                                    onChange('storageSpaceQuota', value)
                                }
                                preview={
                                    Number(values.storageSpaceQuota) === 0 ? (
                                        'Unlimited'
                                    ) : (
                                        <>
                                            {storageQuotaLabel.value}{' '}
                                            {storageQuotaLabel.unit}
                                        </>
                                    )
                                }
                                presets={QUOTA_BY_USER_PRESETS}
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button
                            variant="outline"
                            onClick={() => setSelectedRoleId(undefined)}
                        >
                            Close
                        </Button>
                        <Button onClick={onUpdateRole}>Save Role</Button>
                    </div>
                </CardContent>
            </Card>
        );
    }
);

export { UpdateRole };
