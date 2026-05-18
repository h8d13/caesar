// Prompts the user to re-enter their password to re-derive the E2EE
// private key without re-logging in (which would rotate the JWT and
// invalidate other devices). Verifies the derive by matching its public
// key against the one the server already has for this user.

import { useOwnUserId } from '@/features/server/users/hooks';
import { useForm } from '@/hooks/use-form';
import { tryDeriveAndSetAsync } from '@/lib/e2ee';
import { getTRPCClient } from '@/lib/trpc';
import { AutoFocus, Input } from '@caesar/ui';
import { memo, useCallback, useState } from 'react';
import { DialogShell } from '../dialog-shell';
import type { TDialogBaseProps } from '../types';

const E2eePasswordDialog = memo(({ isOpen, close }: TDialogBaseProps) => {
    const ownUserId = useOwnUserId();
    const { r, values, setErrors, errors } = useForm({ password: '' });
    const [loading, setLoading] = useState(false);

    const onSubmit = useCallback(async () => {
        if (ownUserId === undefined) {
            setErrors({ _general: 'Missing session. Re-login.' });
            return;
        }

        setLoading(true);
        try {
            const trpc = getTRPCClient();
            const [{ identity }, { publicKey }] = await Promise.all([
                trpc.users.me.query(),
                trpc.keys.getPublic.query({ userId: ownUserId })
            ]);

            // argon2id runs in a worker (lib/e2ee.worker.ts), so the
            // main thread stays responsive while we wait.
            const ok = await tryDeriveAndSetAsync(
                values.password,
                identity,
                publicKey
            );

            if (!ok) {
                setErrors({ _general: 'Wrong password.' });
                return;
            }

            close();
        } catch (e) {
            setErrors({
                _general: e instanceof Error ? e.message : String(e)
            });
        } finally {
            setLoading(false);
        }
    }, [ownUserId, values.password, close, setErrors]);

    return (
        <DialogShell
            isOpen={isOpen}
            title="Re-enter your password"
            description="Auto-login skips deriving your encryption key. Enter your password to read and send ephemeral messages in this session. Your password stays in this tab."
            confirmLabel={loading ? 'Deriving…' : 'Unlock'}
            onCancel={close}
            onConfirm={onSubmit}
            confirmDisabled={!values.password || loading}
        >
            <div className="flex flex-col gap-2">
                <AutoFocus>
                    <Input
                        {...r('password')}
                        className="mt-2"
                        type="password"
                        autoComplete="current-password"
                        error={errors._general}
                        onEnter={onSubmit}
                    />
                </AutoFocus>
            </div>
        </DialogShell>
    );
});

E2eePasswordDialog.displayName = 'E2eePasswordDialog';

export { E2eePasswordDialog };
