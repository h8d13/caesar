import { Spinner } from '@caesar/ui';
import { memo, useEffect, useState } from 'react';

// Giphy's own public web key (the one giphy.com ships in its frontend),
// so no per-deployment API key is needed. Rate limits are shared with
// every other keyless consumer; swap in a real key if this dries up.
const GIPHY_PUBLIC_KEY = 'Gc7131jiJuvI7IdN0HZ1D7nh0ow5BU6g';
const GIPHY_API_BASE = 'https://api.giphy.com/v1/gifs';
const SEARCH_DEBOUNCE_MS = 350;
const PAGE_SIZE = 24;

type TGif = {
    id: string;
    title: string;
    previewUrl: string;
    width: number;
    height: number;
};

type TGiphyResponse = {
    data: {
        id: string;
        title: string;
        images: {
            fixed_width: {
                url: string;
                webp?: string;
                width: string;
                height: string;
            };
        };
    }[];
};

const fetchGifs = async (
    query: string,
    signal: AbortSignal
): Promise<TGif[]> => {
    const endpoint = query
        ? `${GIPHY_API_BASE}/search?q=${encodeURIComponent(query)}&`
        : `${GIPHY_API_BASE}/trending?`;

    const res = await fetch(
        `${endpoint}api_key=${GIPHY_PUBLIC_KEY}&limit=${PAGE_SIZE}&rating=pg-13`,
        { signal }
    );

    if (!res.ok) throw new Error(`giphy ${res.status}`);

    const json = (await res.json()) as TGiphyResponse;

    return json.data.map((gif) => ({
        id: gif.id,
        title: gif.title,
        previewUrl: gif.images.fixed_width.webp || gif.images.fixed_width.url,
        width: parseInt(gif.images.fixed_width.width, 10) || 200,
        height: parseInt(gif.images.fixed_width.height, 10) || 200
    }));
};

type TGifGridProps = {
    search: string;
    onSelect: (url: string) => void;
};

const GifGrid = memo(({ search, onSelect }: TGifGridProps) => {
    const [gifs, setGifs] = useState<TGif[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    // Debounced fetch; empty search falls back to trending.
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(false);

        const timeout = setTimeout(
            () => {
                fetchGifs(search.trim(), controller.signal)
                    .then((results) => {
                        setGifs(results);
                        setLoading(false);
                    })
                    .catch((e) => {
                        if (controller.signal.aborted) return;
                        console.warn('gif fetch failed', e);
                        setError(true);
                        setLoading(false);
                    });
            },
            search.trim() ? SEARCH_DEBOUNCE_MS : 0
        );

        return () => {
            clearTimeout(timeout);
            controller.abort();
        };
    }, [search]);

    return (
        <div className="h-full flex flex-col min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto p-2">
                {loading && (
                    <div className="flex justify-center py-8">
                        <Spinner size="xxs" />
                    </div>
                )}

                {!loading && error && (
                    <div className="text-sm text-muted-foreground py-8 text-center">
                        Could not load GIFs.
                    </div>
                )}

                {!loading && !error && gifs.length === 0 && (
                    <div className="text-sm text-muted-foreground py-8 text-center">
                        No GIFs found.
                    </div>
                )}

                {!loading && !error && (
                    <div className="columns-2 gap-2">
                        {gifs.map((gif) => (
                            <button
                                key={gif.id}
                                type="button"
                                className="mb-2 w-full cursor-pointer rounded overflow-hidden hover:opacity-80 transition-opacity"
                                onClick={() =>
                                    // Canonical media URL: path ends in
                                    // .gif so the message renderer inlines
                                    // it like any other image link.
                                    onSelect(
                                        `https://media.giphy.com/media/${gif.id}/giphy.gif`
                                    )
                                }
                                title={gif.title}
                            >
                                <img
                                    src={gif.previewUrl}
                                    alt={gif.title}
                                    width={gif.width}
                                    height={gif.height}
                                    loading="lazy"
                                    className="w-full h-auto rounded"
                                />
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="px-3 py-1.5 border-t text-[10px] text-muted-foreground text-right">
                Powered by GIPHY
            </div>
        </div>
    );
});

GifGrid.displayName = 'GifGrid';

export { GifGrid };
