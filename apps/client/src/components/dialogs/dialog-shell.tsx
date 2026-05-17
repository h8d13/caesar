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

// Outer shell shared by every Alert-style dialog: title + description
// header, body via children, autofocused Cancel/Confirm footer. Each
// caller keeps full control over its body content + button handlers;
// only the structural boilerplate moves in here.
type Props = {
    isOpen: boolean;
    title: ReactNode;
    description?: ReactNode;
    descriptionClassName?: string;
    afterHeader?: ReactNode;
    children?: ReactNode;
    cancelLabel?: string;
    confirmLabel?: string;
    onCancel?: () => void;
    onConfirm?: () => void;
    confirmDisabled?: boolean;
};

const DialogShell = memo(
    ({
        isOpen,
        title,
        description,
        descriptionClassName,
        afterHeader,
        children,
        cancelLabel = 'Cancel',
        confirmLabel = 'Confirm',
        onCancel,
        onConfirm,
        confirmDisabled
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
                <AlertDialogFooter className="gap-2">
                    <AlertDialogCancel onClick={onCancel}>
                        {cancelLabel}
                    </AlertDialogCancel>
                    <AutoFocus>
                        <AlertDialogAction
                            onClick={onConfirm}
                            disabled={confirmDisabled}
                        >
                            {confirmLabel}
                        </AlertDialogAction>
                    </AutoFocus>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
);

DialogShell.displayName = 'DialogShell';

export { DialogShell };
