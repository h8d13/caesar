import { useLatestCallback } from '@/hooks/use-latest-callback';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AutoFocus
} from '@caesar/ui';
import { memo, type ReactNode } from 'react';

// Outer frame shared by every Alert-style dialog: title + description
// header, body via children. Callers render DialogShellFooter (autofocused
// Cancel/Confirm) inside children, next to any body state, so typing in a
// body never re-renders the Radix layers above it (see FormDialogShell).
type Props = {
    isOpen: boolean;
    title: ReactNode;
    description?: ReactNode;
    descriptionClassName?: string;
    afterHeader?: ReactNode;
    children?: ReactNode;
};

const DialogShell = memo(
    ({
        isOpen,
        title,
        description,
        descriptionClassName,
        afterHeader,
        children
    }: Props) => (
        <AlertDialog open={isOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription
                        className={
                            descriptionClassName ??
                            (description ? undefined : 'sr-only')
                        }
                    >
                        {description ?? title}
                    </AlertDialogDescription>
                    {afterHeader}
                </AlertDialogHeader>
                {children}
            </AlertDialogContent>
        </AlertDialog>
    )
);

DialogShell.displayName = 'DialogShell';

type TFooterProps = {
    cancelLabel?: string;
    confirmLabel?: string;
    onCancel?: () => void;
    onConfirm?: () => void;
    confirmDisabled?: boolean;
};

const DialogShellFooter = memo(
    ({
        cancelLabel = 'Cancel',
        confirmLabel = 'Confirm',
        onCancel,
        onConfirm,
        confirmDisabled
    }: TFooterProps) => {
        // confirm handlers may close over body values: keep the button stable
        const confirm = useLatestCallback(() => onConfirm?.());

        return (
            <AlertDialogFooter className="gap-2">
                <AlertDialogCancel onClick={onCancel}>
                    {cancelLabel}
                </AlertDialogCancel>
                <AutoFocus>
                    <AlertDialogAction
                        onClick={confirm}
                        disabled={confirmDisabled}
                    >
                        {confirmLabel}
                    </AlertDialogAction>
                </AutoFocus>
            </AlertDialogFooter>
        );
    }
);

DialogShellFooter.displayName = 'DialogShellFooter';

export { DialogShell, DialogShellFooter };
