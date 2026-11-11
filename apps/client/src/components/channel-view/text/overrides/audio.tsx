import { isTrustedMediaUrl } from '@/helpers/media-url';
import { memo, useCallback, useState } from 'react';
import { OverrideLayout } from './layout';

type TAudioOverrideProps = {
    src: string;
};

const AudioOverride = memo(({ src }: TAudioOverrideProps) => {
    const [error, setError] = useState(false);

    const onError = useCallback(() => {
        setError(true);
    }, []);

    // off-origin media never plays (CSP media-src); the link stays
    if (error || !isTrustedMediaUrl(src)) return null;

    return (
        <OverrideLayout>
            <audio
                src={src}
                controls
                preload="metadata"
                onError={onError}
                className="max-w-full rounded-md"
            />
        </OverrideLayout>
    );
});

export { AudioOverride };
