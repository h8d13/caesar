import { DatePicker } from '@/components/date-picker';
import { useRoles } from '@/features/server/roles/hooks';
import { useForm } from '@/hooks/use-form';
import { getTRPCClient } from '@/lib/trpc';
import {
    Group,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@caesar/ui';
import { memo, useCallback } from 'react';
import { toast } from 'sonner';
import { FormDialogShell } from '../form-dialog-shell';
import type { TDialogBaseProps } from '../types';

type TCreateInviteDialogProps = TDialogBaseProps & {
    refetch: () => void;
};

const CreateInviteDialog = memo(
    ({ refetch, close, isOpen }: TCreateInviteDialogProps) => {
        const roles = useRoles();
        const { r, rrn, values, setTrpcErrors, onChange } = useForm({
            maxUses: 0,
            expiresAt: 0,
            roleId: 0
        });

        const handleCreate = useCallback(async () => {
            const trpc = getTRPCClient();

            try {
                const payload: Record<string, unknown> = { ...values };

                // Only send roleId if a role was selected (not "None")
                if (!payload.roleId) {
                    delete payload.roleId;
                }

                await trpc.invites.add.mutate(payload);

                toast.success('Invite created');

                refetch();
                close();
            } catch (error) {
                setTrpcErrors(error);
            }
        }, [close, refetch, setTrpcErrors, values]);

        return (
            <FormDialogShell
                isOpen={isOpen}
                close={close}
                title="Create Server Invite"
                description="Create a new invitation link for users to join the server."
                confirmLabel="Create Invite"
                onConfirm={handleCreate}
            >
                <div className="space-y-4">
                    <Group
                        label="Max uses"
                        description="Use 0 for unlimited uses."
                    >
                        <Input
                            placeholder="Max uses"
                            {...r('maxUses', 'number')}
                        />
                    </Group>
                    <Group
                        label="Expires in"
                        description="Leave empty for no expiration."
                    >
                        <DatePicker
                            {...rrn('expiresAt')}
                            minDate={Date.now()}
                        />
                    </Group>
                    <Group
                        label="Assign Role"
                        description="Users joining with this invite will be assigned this role."
                    >
                        <Select
                            onValueChange={(value) =>
                                onChange('roleId', Number(value))
                            }
                            value={values.roleId.toString()}
                        >
                            <SelectTrigger className="w-[230px]">
                                <SelectValue placeholder="Select a role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="0">Default</SelectItem>
                                {roles.map((role) => (
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
                </div>
            </FormDialogShell>
        );
    }
);

export { CreateInviteDialog };
