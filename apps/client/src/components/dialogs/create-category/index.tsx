import { useForm } from '@/hooks/use-form';
import { getTRPCClient } from '@/lib/trpc';
import { AutoFocus, Group, Input } from '@caesar/ui';
import { memo, useCallback, useState } from 'react';
import { FormDialogShell } from '../form-dialog-shell';
import type { TDialogBaseProps } from '../types';

type TCreateCategoryDialogProps = TDialogBaseProps;

const CreateCategoryDialog = memo(
    ({ isOpen, close }: TCreateCategoryDialogProps) => {
        const { values, r, setTrpcErrors } = useForm({
            name: 'New Category'
        });
        const [loading, setLoading] = useState(false);

        const onSubmit = useCallback(async () => {
            const trpc = getTRPCClient();

            setLoading(true);

            try {
                await trpc.categories.add.mutate({
                    name: values.name
                });

                close();
            } catch (error) {
                setTrpcErrors(error);
            } finally {
                setLoading(false);
            }
        }, [values.name, close, setTrpcErrors]);

        return (
            <FormDialogShell
                isOpen={isOpen}
                close={close}
                title="Create New Category"
                confirmLabel="Create Category"
                onConfirm={onSubmit}
                confirmDisabled={loading}
            >
                <Group label="Category name">
                    <AutoFocus>
                        <Input
                            {...r('name')}
                            placeholder="Category name"
                            onEnter={onSubmit}
                        />
                    </AutoFocus>
                </Group>
            </FormDialogShell>
        );
    }
);

export { CreateCategoryDialog };
