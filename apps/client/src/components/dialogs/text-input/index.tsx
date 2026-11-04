import { useLatestCallback } from '@/hooks/use-latest-callback';
import { AutoFocus, Input } from '@caesar/ui';
import { memo, useCallback, useState } from 'react';
import { DialogShell, DialogShellFooter } from '../dialog-shell';
import type { TDialogBaseProps } from '../types';

type TTextInputDialogProps = TDialogBaseProps & {
    onCancel?: () => void;
    onConfirm?: (text: string | undefined) => void;
    title?: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    allowEmpty?: boolean;
    isModalOpen: boolean;
    type?: 'text' | 'password';
};

type TTextInputFormProps = Pick<
    TTextInputDialogProps,
    'onConfirm' | 'confirmLabel' | 'cancelLabel' | 'allowEmpty' | 'type'
> & { onCancel: () => void };

// Input state lives here, inside the shell: typing re-renders this body
// only, not the dialog layers above it.
const TextInputForm = memo(
    ({
        onCancel,
        onConfirm,
        confirmLabel,
        cancelLabel,
        allowEmpty,
        type
    }: TTextInputFormProps) => {
        const [value, setValue] = useState<string | undefined>(undefined);

        const onSubmit = useLatestCallback(() => {
            onConfirm?.(value);
        });

        return (
            <>
                <AutoFocus>
                    <Input
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onEnter={onSubmit}
                        className="mt-2"
                        type={type}
                        autoFocus
                    />
                </AutoFocus>
                <DialogShellFooter
                    cancelLabel={cancelLabel}
                    confirmLabel={confirmLabel}
                    onCancel={onCancel}
                    onConfirm={onSubmit}
                    confirmDisabled={!allowEmpty && !value}
                />
            </>
        );
    }
);

const TextInputDialog = memo(
    ({
        isOpen,
        close,
        onCancel,
        onConfirm,
        title,
        message,
        confirmLabel,
        cancelLabel,
        allowEmpty,
        type
    }: TTextInputDialogProps) => {
        const onCancelClick = useCallback(() => {
            onCancel?.();
            close();
        }, [onCancel, close]);

        return (
            <DialogShell isOpen={isOpen} title={title} description={message}>
                <TextInputForm
                    onCancel={onCancelClick}
                    onConfirm={onConfirm}
                    confirmLabel={confirmLabel}
                    cancelLabel={cancelLabel}
                    allowEmpty={allowEmpty}
                    type={type}
                />
            </DialogShell>
        );
    }
);

export { TextInputDialog };
