import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@caesar/ui';
import { memo, type ReactNode } from 'react';

// Outer shell shared by every `Dialog`-style create-form modal (create
// channel, category, invite). Companion to DialogShell which wraps the
// `AlertDialog` variant. Body via children; each caller owns its inputs
// and submit handler. Action button label is required (it labels the
// concrete action: "Create channel", "Create invite"...).
type Props = {
    isOpen: boolean;
    close: () => void;
    title: ReactNode;
    description?: ReactNode;
    descriptionClassName?: string;
    children?: ReactNode;
    cancelLabel?: string;
    confirmLabel: string;
    onConfirm: () => void;
    confirmDisabled?: boolean;
};

const FormDialogShell = memo(
    ({
        isOpen,
        close,
        title,
        description,
        descriptionClassName,
        children,
        cancelLabel = 'Cancel',
        confirmLabel,
        onConfirm,
        confirmDisabled
    }: Props) => (
        <Dialog open={isOpen}>
            <DialogContent onInteractOutside={close} close={close}>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription
                        className={
                            descriptionClassName ??
                            (description ? undefined : 'sr-only')
                        }
                    >
                        {description ?? title}
                    </DialogDescription>
                </DialogHeader>

                {children}

                <DialogFooter className="gap-2">
                    <Button variant="ghost" onClick={close}>
                        {cancelLabel}
                    </Button>
                    <Button onClick={onConfirm} disabled={confirmDisabled}>
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
);

FormDialogShell.displayName = 'FormDialogShell';

export { FormDialogShell };
