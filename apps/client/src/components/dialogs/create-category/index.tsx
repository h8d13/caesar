import { useForm } from '@/hooks/use-form';
import { useLatestCallback } from '@/hooks/use-latest-callback';
import { getTRPCClient } from '@/lib/trpc';
import { AutoFocus, Group, Input } from '@caesar/ui';
import { memo, useState } from 'react';
import { FormDialogFooter, FormDialogShell } from '../form-dialog-shell';
import type { TDialogBaseProps } from '../types';

// Form state lives here, inside the shell: typing re-renders this body
// only, not the dialog layers above it.
const CreateCategoryForm = memo(({ close }: { close: () => void }) => {
    const { values, r, setTrpcErrors } = useForm({
        name: 'New Category'
    });
    const [loading, setLoading] = useState(false);

    const onSubmit = useLatestCallback(async () => {
        const trpc = getTRPCClient();

        setLoading(true);

        try {
            await trpc.categories.add.mutate({
                name: values.name
            });

            close();
        } catch (error) {
            setTrpcErrors(error);
        }
        // not `finally`: the React Compiler skips try/finally
        setLoading(false);
    });

    return (
        <>
            <Group label="Category name">
                <AutoFocus>
                    <Input
                        {...r('name')}
                        placeholder="Category name"
                        onEnter={onSubmit}
                    />
                </AutoFocus>
            </Group>

            <FormDialogFooter
                close={close}
                confirmLabel="Create Category"
                onConfirm={onSubmit}
                confirmDisabled={loading}
            />
        </>
    );
});

const CreateCategoryDialog = memo(({ isOpen, close }: TDialogBaseProps) => (
    <FormDialogShell isOpen={isOpen} close={close} title="Create New Category">
        <CreateCategoryForm close={close} />
    </FormDialogShell>
));

export { CreateCategoryDialog };
