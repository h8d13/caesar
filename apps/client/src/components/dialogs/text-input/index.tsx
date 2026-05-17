import { AutoFocus, Input } from '@caesar/ui';
import { memo, useCallback, useState } from 'react';
import { DialogShell } from '../dialog-shell';
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
        const [value, setValue] = useState<string | undefined>(undefined);

        const onSubmit = useCallback(() => {
            onConfirm?.(value);
        }, [onConfirm, value]);

        const onCancelClick = useCallback(() => {
            onCancel?.();
            close();
        }, [onCancel, close]);

        return (
            <DialogShell
                isOpen={isOpen}
                title={title}
                description={message}
                cancelLabel={cancelLabel}
                confirmLabel={confirmLabel}
                onCancel={onCancelClick}
                onConfirm={onSubmit}
                confirmDisabled={!allowEmpty && !value}
            >
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
            </DialogShell>
        );
    }
);

export { TextInputDialog };
