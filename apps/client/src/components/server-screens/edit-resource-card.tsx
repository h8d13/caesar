import { Button, Card, CardAction, CardContent, CardHeader } from '@caesar/ui';
import { Trash2 } from 'lucide-react';
import { memo, type ReactNode } from 'react';

// Edit-screen card shared by the admin "edit X" panels (sound, emoji,
// permission override). Every panel has the same three-part header
// (left-aligned identity, right-aligned trash, secondary Cancel/Save
// footer) over a body. Callers retain their own delete confirmation
// flow, save handler, and body content.
type Props = {
    // Left side of the header row: a CardTitle, a custom header
    // subcomponent, or any other identity markup.
    leftHeader: ReactNode;
    onDelete: () => void;
    // When true the trash button gets the destructive text color.
    // The visual stays subtle on its own, the destructive variant is
    // for cases where the deletion is irreversible at the panel level
    // (permission overrides) vs the usual confirm-then-delete flow.
    deleteDestructive?: boolean;
    onClose: () => void;
    closeLabel?: string;
    onSave: () => void;
    saveDisabled?: boolean;
    saveLabel?: string;
    children?: ReactNode;
};

const EditResourceCard = memo(
    ({
        leftHeader,
        onDelete,
        deleteDestructive,
        onClose,
        closeLabel = 'Close',
        onSave,
        saveDisabled,
        saveLabel = 'Save Changes',
        children
    }: Props) => (
        <Card className="flex-1">
            <CardHeader>
                <div className="flex items-center justify-between">
                    {leftHeader}
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={onDelete}
                        className={
                            deleteDestructive
                                ? 'text-destructive hover:text-destructive'
                                : undefined
                        }
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
                <CardAction>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>
                            {closeLabel}
                        </Button>
                        <Button onClick={onSave} disabled={saveDisabled}>
                            {saveLabel}
                        </Button>
                    </div>
                </CardAction>
            </CardHeader>
            <CardContent className="space-y-6">{children}</CardContent>
        </Card>
    )
);

EditResourceCard.displayName = 'EditResourceCard';

export { EditResourceCard };
