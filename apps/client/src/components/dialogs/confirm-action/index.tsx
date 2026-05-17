import { memo } from 'react';
import { DialogShell } from '../dialog-shell';
import type { TDialogBaseProps } from '../types';

type TConfirmActionDialogProps = TDialogBaseProps & {
    onCancel?: () => void;
    onConfirm?: () => void;
    title?: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'destructive' | 'default';
};

const ConfirmActionDialog = memo(
    ({
        isOpen,
        onCancel,
        onConfirm,
        title,
        message,
        confirmLabel,
        cancelLabel
    }: TConfirmActionDialogProps) => (
        <DialogShell
            isOpen={isOpen}
            title={title ?? 'Confirm Action'}
            description={
                message ?? 'Are you sure you want to perform this action?'
            }
            descriptionClassName="whitespace-pre-line break-all"
            cancelLabel={cancelLabel}
            confirmLabel={confirmLabel}
            onCancel={onCancel}
            onConfirm={onConfirm}
        />
    )
);

export default ConfirmActionDialog;
