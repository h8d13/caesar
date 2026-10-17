import { FullScreenImage } from '@/components/fullscreen-image/content';
import { memo, useCallback, useState } from 'react';
import { OverrideLayout } from './layout';

type TImageOverrideProps = {
    src: string;
    alt?: string;
    title?: string;
};

// The GIF picker posts Giphy's canonical original (giphy.gif, often several
// MB). Display the same-size animated WebP rendition instead: 2-7x smaller,
// and it fixes already-sent messages too since the stored link is untouched.
const GIPHY_ORIGINAL_GIF =
    /^(https:\/\/media\d?\.giphy\.com\/media\/[\w-]+)\/giphy\.gif$/;

const toDisplaySrc = (src: string) =>
    src.replace(GIPHY_ORIGINAL_GIF, '$1/giphy.webp');

const ImageOverride = memo(({ src: rawSrc, alt }: TImageOverrideProps) => {
    const src = toDisplaySrc(rawSrc);
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
