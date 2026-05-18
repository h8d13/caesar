import { FullScreenImage } from '@/components/fullscreen-image/content';
import { memo, useCallback, useState } from 'react';
import { OverrideLayout } from './layout';

type TImageOverrideProps = {
    src: string;
    alt?: string;
    title?: string;
};

const ImageOverride = memo(({ src, alt }: TImageOverrideProps) => {
    const [error, setError] = useState(false);

    const onLoad = useCallback(
        (event: React.SyntheticEvent<HTMLImageElement>) => {
            event.currentTarget.style.opacity = '1';
        },
        []
    );

    const onError = useCallback(() => {
        setError(true);
    }, []);

    if (error) return null;

    return (
        <OverrideLayout>
            <FullScreenImage
                src={src}
                alt={alt}
                onLoad={onLoad}
                onError={onError}
                className="max-w-full max-h-75 object-contain object-left w-fit"
                style={{ opacity: 0 }}
            />
        </OverrideLayout>
    );
});

export { ImageOverride };
