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

// Outer frame shared by every `Dialog`-style create-form modal (create
// channel, category, invite). Companion to DialogShell (the `AlertDialog`
// variant). Only the frame lives here: callers render a body component
// owning the form state plus FormDialogFooter as children. Typing then
// re-renders that body only; state held above the shell would re-render
// every Radix layer (portal, presence, focus scope...) on each keystroke.
type Props = {
    isOpen: boolean;
    close: () => void;
    title: ReactNode;
    description?: ReactNode;
    descriptionClassName?: string;
    children?: ReactNode;
};

const FormDialogShell = memo(
    ({
        isOpen,
        close,
        title,
        description,
        descriptionClassName,
        children
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
            </DialogContent>
        </Dialog>
    )
);

FormDialogShell.displayName = 'FormDialogShell';

// onConfirm should be stable (useLatestCallback in the body): it usually
// closes over form values
type TFooterProps = {
    close: () => void;
    cancelLabel?: string;
    // labels the concrete action: "Create channel", "Create invite"...
    confirmLabel: string;
    onConfirm: () => void;
    confirmDisabled?: boolean;
};

const FormDialogFooter = memo(
    ({
        close,
        cancelLabel = 'Cancel',
        confirmLabel,
        onConfirm,
        confirmDisabled
    }: TFooterProps) => (
        <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={close}>
                {cancelLabel}
            </Button>
            <Button onClick={onConfirm} disabled={confirmDisabled}>
                {confirmLabel}
            </Button>
        </DialogFooter>
    )
);

FormDialogFooter.displayName = 'FormDialogFooter';

export { FormDialogFooter, FormDialogShell };
