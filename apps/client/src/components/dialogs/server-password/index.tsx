import { joinServer } from '@/features/server/actions';
import { useForm } from '@/hooks/use-form';
import { cleanup } from '@/lib/trpc';
import {} from '@/types';
import { AutoFocus, Input } from '@caesar/ui';
import { memo, useCallback, useState } from 'react';
import { DialogShell } from '../dialog-shell';
import type { TDialogBaseProps } from '../types';

type TServerPasswordDialogProps = TDialogBaseProps & {
    handshakeHash: string;
};

const ServerPasswordDialog = memo(
    ({ isOpen, close, handshakeHash }: TServerPasswordDialogProps) => {
        const { r, values, setTrpcErrors, errors } = useForm({
            password: ''
        });
        const [loading, setLoading] = useState(false);

        const onSubmit = useCallback(async () => {
            try {
                setLoading(true);
                await joinServer(handshakeHash, values.password);

                close();
            } catch (error) {
                setTrpcErrors(error);
            } finally {
                setLoading(false);
            }
        }, [handshakeHash, values.password, close, setTrpcErrors]);

        const onCancel = useCallback(() => {
            cleanup();
            close();
        }, [close]);

        return (
            <DialogShell
                isOpen={isOpen}
                title="Enter the password"
                description="This server is password protected. Please enter the password to join."
                confirmLabel="Join"
                onCancel={onCancel}
                onConfirm={onSubmit}
                confirmDisabled={!values.password || loading}
            >
                <div className="flex flex-col gap-2">
                    <AutoFocus>
                        <Input
                            {...r('password')}
                            className="mt-2"
                            type="password"
                            error={errors._general}
                            onEnter={onSubmit}
                        />
                    </AutoFocus>
                </div>
            </DialogShell>
        );
    }
);

export { ServerPasswordDialog };
