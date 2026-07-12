import { format } from 'date-fns';
import { Lock } from 'lucide-react';
import { memo, useEffect, useState } from 'react';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const formatRemaining = (msLeft: number): string => {
    if (msLeft <= 0) return '0m';
    if (msLeft < HOUR) return `${Math.max(1, Math.round(msLeft / MINUTE))}m`;
    if (msLeft < DAY) return `${Math.round(msLeft / HOUR)}h`;
    return `${Math.round(msLeft / DAY)}d`;
};

type TExpiresBadgeProps = {
    expiresAt: number;
};

const ExpiresBadge = memo(({ expiresAt }: TExpiresBadgeProps) => {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), MINUTE);
        return () => clearInterval(id);
    }, []);

    const remaining = expiresAt - now;

    return (
        <span
            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground/80"
            title={`Disappears at ${format(expiresAt, 'PPpp')}`}
        >
            <Lock className="h-3 w-3" />
            {formatRemaining(remaining)}
        </span>
    );
});

export { ExpiresBadge };
