import { infoSelector } from '@/features/server/selectors';
import { memo } from 'react';
import { useSelector } from 'react-redux';

const Version = memo(() => {
    const info = useSelector(infoSelector);

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                    Current Version
                </h3>
                <p className="text-lg font-semibold text-foreground mt-1">
                    {info?.version ?? 'Unknown'}
                </p>
            </div>
        </div>
    );
});

export { Version };
