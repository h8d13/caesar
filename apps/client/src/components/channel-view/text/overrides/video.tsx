import { isTrustedMediaUrl } from '@/helpers/media-url';
import { memo, useCallback, useState } from 'react';
import { OverrideLayout } from './layout';

type TVideoOverrideProps = {
    src: string;
};

const VideoOverride = memo(({ src }: TVideoOverrideProps) => {
    const [error, setError] = useState(false);

    const onError = useCallback(() => {
        setError(true);
    }, []);

    // off-origin media never plays (CSP media-src); the link stays
    if (error || !isTrustedMediaUrl(src)) return null;

    return (
        <OverrideLayout>
            <video
                src={src}
                controls
                preload="metadata"
                onError={onError}
                className="max-w-full max-h-75 rounded-md"
            />
        </OverrideLayout>
    );
});

export { VideoOverride };
