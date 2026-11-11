import {
    DIRECT_IMAGE_URL_PREFIXES,
    GIPHY_MEDIA_HOST_SUFFIX
} from '@caesar/shared';

// Media a message can make the viewer's browser fetch. Anything off-origin
// tells the remote host who looked (IP, user agent, time), and that host is
// chosen by whoever posted the message. The browser only fetches directly:
// - this server (relative URLs, uploads under /public)
// - the fixed third parties in @caesar/shared (Giphy, built-in emoji sets),
//   which the server's CSP img-src mirrors
// Any other image is fetched by the server (/proxy/image).

// stands in for the page origin where there is no window (tests under node)
const PLACEHOLDER_ORIGIN = 'https://self.invalid';

const getOwnOrigin = (): string =>
    typeof window === 'undefined' ? PLACEHOLDER_ORIGIN : window.location.origin;

// 'direct': safe to load as is. 'proxy': an http(s) URL on another host,
// carried as its absolute form. 'other': not something to fetch (data:,
// unparseable); callers leave it to the scheme allowlist.
type TMediaUrl =
    | { kind: 'direct' }
    | { kind: 'proxy'; href: string }
    | { kind: 'other' };

const classify = (url: string): TMediaUrl => {
    const ownOrigin = getOwnOrigin();

    try {
        // parsed like the browser would: covers //host, /\host, ../ segments
        const parsed = new URL(url, ownOrigin);

        if (parsed.origin === ownOrigin) return { kind: 'direct' };

        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { kind: 'other' };
        }

        // href is normalized, so a "../" cannot climb out of a prefix
        const isDirect =
            parsed.protocol === 'https:' &&
            !parsed.username &&
            !parsed.password &&
            (parsed.hostname.endsWith(GIPHY_MEDIA_HOST_SUFFIX) ||
                DIRECT_IMAGE_URL_PREFIXES.some((prefix) =>
                    parsed.href.startsWith(prefix)
                ));

        return isDirect
            ? { kind: 'direct' }
            : { kind: 'proxy', href: parsed.href };
    } catch {
        return { kind: 'other' };
    }
};

const isTrustedMediaUrl = (url: string): boolean =>
    classify(url).kind === 'direct';

// Where an <img> for `url` should point: itself when the browser may load
// it directly, the server's image proxy for any other http(s) image.
const toImageSrc = (url: string): string => {
    const media = classify(url);

    return media.kind === 'proxy'
        ? `/proxy/image?url=${encodeURIComponent(media.href)}`
        : url;
};

export { isTrustedMediaUrl, toImageSrc };
