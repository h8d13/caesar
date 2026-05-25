import { closeServerScreens } from '@/features/server-screens/actions';
import { Button, CardAction } from '@caesar/ui';
import { memo } from 'react';

type Props = {
    onSave: () => void;
    loading: boolean;
};

// Shared Cancel/Save Changes footer for every settings card. Each call
// site otherwise reproduced this exact block including identifier names
// (closeServerScreens, submit, loading). Granularity preserved: the only
// site-specific bits (the submit handler + loading flag) are props.
const SettingsFooterActions = memo(({ onSave, loading }: Props) => (
    <CardAction className="max-sm:w-full">
        <div className="flex gap-2 max-sm:w-full">
            <Button
                variant="outline"
                className="max-sm:flex-1"
                onClick={closeServerScreens}
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
));

SettingsFooterActions.displayName = 'SettingsFooterActions';

export { SettingsFooterActions };
