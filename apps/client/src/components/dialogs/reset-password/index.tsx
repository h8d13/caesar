import { getTRPCClient } from '@/lib/trpc';
import { getTrpcError, type TJoinedUser } from '@caesar/shared';
import { Alert, AlertDescription, Input } from '@caesar/ui';
import { AlertCircleIcon } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { DialogShell } from '../dialog-shell';
import type { TDialogBaseProps } from '../types';

type TResetPasswordDialogProps = TDialogBaseProps & {
    user: TJoinedUser;
    refetch: () => void;
};

// Two-step: confirm, then display the one-shot credential the server
// minted. The plaintext exists only in this response, so the dialog must
// not close itself after the mutation - the mod has to copy it out first.
const ResetPasswordDialog = memo(
    ({ isOpen, close, user, refetch }: TResetPasswordDialogProps) => {
        const [temporaryPassword, setTemporaryPassword] = useState<
            string | undefined
        >(undefined);
        const [isResetting, setIsResetting] = useState(false);

        const onReset = useCallback(async () => {
            try {
                setIsResetting(true);

                const { temporaryPassword } =
                    await getTRPCClient().users.resetPassword.mutate({
                        userId: user.id
                    });

                setTemporaryPassword(temporaryPassword);
                refetch();
            } catch (error) {
                toast.error(getTrpcError(error, 'Failed to reset password'));
                close();
            } finally {
                setIsResetting(false);
            }
        }, [user.id, refetch, close]);

        const onCopy = useCallback(() => {
            if (!temporaryPassword) return;

            navigator.clipboard.writeText(temporaryPassword);
            toast.success('Temporary password copied to clipboard');
        }, [temporaryPassword]);

        if (temporaryPassword) {
            return (
                <DialogShell
                    isOpen={isOpen}
                    title={`Temporary password for ${user.name}`}
                    description="Shown once. Copy it now and send it to the user over a channel you trust."
                    cancelLabel="Done"
                    confirmLabel="Copy"
                    onCancel={close}
                    onConfirm={onCopy}
                >
                    <div className="flex flex-col gap-4">
                        <Input
                            readOnly
                            value={temporaryPassword}
                            className="font-mono"
                        />

                        <Alert variant="info" className="py-2">
                            <AlertCircleIcon className="h-4 w-4" />
                            <AlertDescription className="text-xs">
                                All of this user's sessions were signed out.
                                They should change this password from their
                                settings after signing back in.
                            </AlertDescription>
                        </Alert>
                    </div>
                </DialogShell>
            );
        }

        return (
            <DialogShell
                isOpen={isOpen}
                title={`Reset password for ${user.name}`}
                description="The server generates a new password and shows it to you once."
                confirmLabel="Reset Password"
                onCancel={close}
                onConfirm={onReset}
                confirmDisabled={isResetting}
            >
                <Alert variant="destructive" className="py-2">
                    <AlertCircleIcon className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                        This signs the user out everywhere and invalidates their
                        existing tokens. Their end-to-end encrypted DM key is
                        derived from their password, so past encrypted DMs
                        become unreadable to them.
                    </AlertDescription>
                </Alert>
            </DialogShell>
        );
    }
);

export { ResetPasswordDialog };
