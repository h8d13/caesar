import { closeServerScreens } from '@/features/server-screens/actions';
import { Button, CardAction } from '@caesar/ui';
import { memo } from 'react';

type Props = {
    onSave: () => void;
    loading: boolean;
    // defaults to closing all server screens, not just this card
    onCancel?: () => void;
};

// Shared settings footer.
const SettingsFooterActions = memo(
    ({ onSave, loading, onCancel = closeServerScreens }: Props) => (
        <CardAction className="max-sm:w-full">
            <div className="flex gap-2 max-sm:w-full">
                <Button
                    variant="outline"
                    className="max-sm:flex-1"
                    onClick={onCancel}
                >
                    Cancel
                </Button>
                <Button
                    className="max-sm:flex-1"
                    onClick={onSave}
                    disabled={loading}
                >
                    Save Changes
                </Button>
            </div>
        </CardAction>
    )
);

SettingsFooterActions.displayName = 'SettingsFooterActions';

export { SettingsFooterActions };
