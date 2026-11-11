import type { TMessageMetadata } from '@caesar/shared';
import {
  MAX_URL_LENGTH,
  publicGet,
  type TPublicFetchDeps
} from '@server/helpers/public-fetch';

// Link previews: one bounded GET of a member-supplied URL (see
// helpers/public-fetch for the limits), then the few <head> tags a preview
// card shows.
const TOTAL_TIMEOUT_MS = 5_000;
// the tags we want sit in <head>: enough is enough
const MAX_BODY_BYTES = 512 * 1024;
const MAX_IMAGES = 3;
const MAX_TITLE_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 1_000;

const HTML_TYPE = /^(text\/html|application\/xhtml\+xml)\b/i;

const decodeBody = (body: Buffer, contentType: string): string => {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];

  try {
    return new TextDecoder(charset ?? 'utf-8').decode(body);
  } catch {
    return body.toString('utf8');
  }
};

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
};

const decodeEntities = (value: string): string =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] !== '#') return ENTITIES[entity.toLowerCase()] ?? match;

    const code =
      entity[1]?.toLowerCase() === 'x'
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);

    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });

const ATTRIBUTE = /([a-z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;

const parseAttributes = (tag: string): Record<string, string> => {
  const attributes: Record<string, string> = {};

  for (const match of tag.matchAll(ATTRIBUTE)) {
    const name = match[1]!.toLowerCase();

    // first wins, as in a browser
    attributes[name] ??= decodeEntities(
      match[2] ?? match[3] ?? match[4] ?? ''
    ).trim();
  }

  return attributes;
};

const clean = (value: string | undefined, max: number): string | undefined => {
  const text = value?.replace(/\s+/g, ' ').trim();

  return text ? text.slice(0, max) : undefined;
};

// absolute http(s) URL or nothing: the client shows these as links/images
const toAbsoluteUrl = (value: string | undefined, base: string) => {
  if (!value) return;

  try {
    const url = new URL(value, base);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    return url.href.length <= MAX_URL_LENGTH ? url.href : undefined;
  } catch {
    // not a URL: nothing to show
  }
};

// The preview fields of an HTML document. Text only ever leaves here as
// plain strings (the client renders them as text nodes), URLs as absolute
// http(s).
const parsePreview = (html: string, url: string): TMessageMetadata => {
  const headEnd = html.search(/<\/head\s*>/i);
  const head = headEnd === -1 ? html : html.slice(0, headEnd);

  const meta = new Map<string, string[]>();

  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseAttributes(tag);
    const key = (attributes.property ?? attributes.name)?.toLowerCase();

    if (!key || !attributes.content) continue;

    const values = meta.get(key);

    if (values) values.push(attributes.content);
    else meta.set(key, [attributes.content]);
  }

  const first = (...keys: string[]) => {
    for (const key of keys) {
      const value = meta.get(key)?.[0];

      if (value) return value;
    }
  };

  const titleTag = /<title\b[^>]*>([^<]*)<\/title\s*>/i.exec(head)?.[1];

  const favicons: string[] = [];

  for (const [tag] of head.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = parseAttributes(tag);

    if (!/(^|\s)icon(\s|$)/i.test(attributes.rel ?? '')) continue;

    const href = toAbsoluteUrl(attributes.href, url);

    if (href) favicons.push(href);
  }

  if (favicons.length === 0) {
    const fallback = toAbsoluteUrl('/favicon.ico', url);

    if (fallback) favicons.push(fallback);
  }

  const images = [
    ...(meta.get('og:image') ?? []),
    ...(meta.get('twitter:image') ?? [])
  ]
    .map((image) => toAbsoluteUrl(image, url))
    .filter((image): image is string => !!image);

  return {
    url,
    title: clean(
      first('og:title', 'twitter:title') ??
        (titleTag ? decodeEntities(titleTag) : undefined),
      MAX_TITLE_LENGTH
    ),
    siteName: clean(first('og:site_name'), MAX_TITLE_LENGTH),
    description: clean(
      first('og:description', 'description', 'twitter:description'),
      MAX_DESCRIPTION_LENGTH
    ),
    mediaType: clean(first('og:type'), 64) ?? 'website',
    images: [...new Set(images)].slice(0, MAX_IMAGES),
    videos: [],
    favicons: favicons.slice(0, 1)
  };
};

// undefined when there is nothing to show or the URL may not be fetched;
// throws only on network errors and the deadline.
const fetchLinkPreview = async (
  url: string,
  deps?: TPublicFetchDeps
): Promise<TMessageMetadata | undefined> => {
  const response = await publicGet(
    url,
    {
      timeoutMs: TOTAL_TIMEOUT_MS,
      maxBytes: MAX_BODY_BYTES,
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      // only an HTML body is worth reading: the client embeds media by
      // extension
      wantsBody: (contentType) => HTML_TYPE.test(contentType),
      overflow: 'truncate'
    },
    deps
  );

  if (!response || response.body.length === 0) return undefined;

  // relative URLs in the page resolve against where it was finally served
  const preview = parsePreview(
    decodeBody(response.body, response.contentType),
    response.url
  );

  // a page with neither title nor description makes an empty card
  return preview.title || preview.description ? { ...preview, url } : undefined;
};

export { fetchLinkPreview, parsePreview };
