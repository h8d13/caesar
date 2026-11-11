import fs from 'fs';
import type http from 'http';
import path from 'path';
import { config } from '../config';
import { getSessionUserByToken } from '../db/queries/users';
import { IMAGE_CACHE_PATH } from '../helpers/paths';
import {
  MAX_URL_LENGTH,
  publicGet,
  type TPublicFetchDeps
} from '../helpers/public-fetch';
import { getSessionToken } from '../helpers/session-token';
import { sha256 } from '../helpers/sha256';
import { isFetchableUrl } from '../helpers/url-guard';
import { logger } from '../logger';
import { createRateLimiter } from '../utils/rate-limiters/rate-limiter';
import {
  hasMatchingEtag,
  type HttpRouteHandler,
  pipeFile,
  sendJson
} from './helpers';
import { enforceHttpRateLimit } from './rate-limit';

// GET /proxy/image?url=<off-site image>
//
// A message can carry an image hosted anywhere. Loaded straight from the
// browser, that request hands the remote host (picked by whoever posted the
// message) the IP, user agent and viewing time of everyone who sees it. The
// client points such images here instead: the server fetches them once
// (helpers/public-fetch: public addresses only, pinned, bounded) and serves
// the bytes from this origin, so the remote host only ever sees the server.
//
// Members only: this is the server fetching on a member's behalf, the same
// trust as link previews.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_CACHE_BYTES = 256 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
// each fetch buffers its image: a message full of large images opened at
// once must not hold them all in memory
const MAX_CONCURRENT_FETCHES = 4;
// a dead link is not refetched for every viewer of the message
const FAILURE_TTL_MS = 5 * 60_000;
const MAX_FAILURES = 1_000;

// What a browser decodes as a passive image. No SVG: it is a document that
// can carry script, and it would be served from our own origin.
const IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif'
]);

const toImageType = (contentType: string): string | undefined => {
  const type = contentType.split(';')[0]!.trim().toLowerCase();

  return IMAGE_TYPES.has(type) ? type : undefined;
};

// viewers of one channel load the same images at the same time
const imageProxyRateLimiter = createRateLimiter({
  maxRequests: config.rateLimiters.publicFile.maxRequests,
  windowMs: config.rateLimiters.publicFile.windowMs
});

type TCachedImage = { contentType: string; size: number };

type TImageProxyOptions = {
  fetchDeps?: TPublicFetchDeps;
  cacheDir?: string;
};

const createImageProxyHandler = ({
  fetchDeps,
  cacheDir = IMAGE_CACHE_PATH
}: TImageProxyOptions = {}): HttpRouteHandler => {
  const isAllowedUrl = fetchDeps?.isAllowedUrl ?? isFetchableUrl;

  // Insertion order is recency: a hit re-inserts its key, eviction takes
  // from the front. The index lives in memory and the directory is emptied
  // on first use, so files never outlive the process that knows them.
  const cached = new Map<string, TCachedImage>();
  const failures = new Map<string, number>();
  const inFlight = new Map<string, Promise<TCachedImage | undefined>>();
  let cachedBytes = 0;
  let ready: Promise<void> | undefined;
  let activeFetches = 0;
  const fetchQueue: (() => void)[] = [];

  // at most MAX_CONCURRENT_FETCHES upstream downloads at a time
  const withFetchSlot = async <T>(work: () => Promise<T>): Promise<T> => {
    if (activeFetches >= MAX_CONCURRENT_FETCHES) {
      await new Promise<void>((resolve) => fetchQueue.push(resolve));
    } else {
      activeFetches++;
    }

    try {
      return await work();
    } finally {
      // hand the slot straight to the next waiter, if any
      const next = fetchQueue.shift();

      if (next) next();
      else activeFetches--;
    }
  };

  const prepare = () =>
    (ready ??= (async () => {
      await fs.promises.rm(cacheDir, { recursive: true, force: true });
      await fs.promises.mkdir(cacheDir, { recursive: true });
    })());

  const filePath = (key: string) => path.join(cacheDir, key);

  const evict = async () => {
    for (const [key, entry] of cached) {
      if (cachedBytes <= MAX_CACHE_BYTES) return;

      cached.delete(key);
      cachedBytes -= entry.size;
      await fs.promises.rm(filePath(key), { force: true });
    }
  };

  const noteFailure = (key: string) => {
    if (failures.size >= MAX_FAILURES) failures.clear();

    failures.set(key, Date.now() + FAILURE_TTL_MS);
  };

  const fetchImage = async (
    url: string,
    key: string
  ): Promise<TCachedImage | undefined> => {
    try {
      const response = await publicGet(
        url,
        {
          timeoutMs: FETCH_TIMEOUT_MS,
          maxBytes: MAX_IMAGE_BYTES,
          accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif',
          wantsBody: (contentType) => toImageType(contentType) !== undefined,
          overflow: 'reject'
        },
        fetchDeps
      );
      const contentType = response && toImageType(response.contentType);

      if (!response || !contentType || response.body.length === 0) {
        noteFailure(key);
        return undefined;
      }

      await prepare();
      await fs.promises.writeFile(filePath(key), response.body);

      const entry = { contentType, size: response.body.length };

      cached.set(key, entry);
      cachedBytes += entry.size;
      await evict();

      return entry;
    } catch (error) {
      logger.debug('[ImageProxy] fetch failed:', error);
      noteFailure(key);

      return undefined;
    }
  };

  const getImage = (url: string, key: string) => {
    const hit = cached.get(key);

    if (hit) {
      cached.delete(key);
      cached.set(key, hit);

      return Promise.resolve(hit);
    }

    const failedUntil = failures.get(key);

    if (failedUntil) {
      if (failedUntil > Date.now()) return Promise.resolve(undefined);

      failures.delete(key);
    }

    let pending = inFlight.get(key);

    if (!pending) {
      pending = withFetchSlot(() => fetchImage(url, key)).finally(() =>
        inFlight.delete(key)
      );
      inFlight.set(key, pending);
    }

    return pending;
  };

  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (
      !enforceHttpRateLimit(req, res, imageProxyRateLimiter, '/proxy/image')
    ) {
      return;
    }

    if (!(await getSessionUserByToken(getSessionToken(req)))) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }

    const url = new URL(req.url ?? '/', 'http://localhost').searchParams.get(
      'url'
    );

    if (!url || url.length > MAX_URL_LENGTH || !isAllowedUrl(url)) {
      sendJson(res, 400, { error: 'Bad request' });
      return;
    }

    // The tag is a hash of the URL: it names the address, not the bytes.
    // Anyone revalidating already holds an image for this URL, so that is
    // answered before (and without) a fetch. The browser asks again after
    // max-age; an image replaced at the same URL shows up once its cached
    // copy is dropped there.
    const key = sha256(url);
    const etag = `"${key}"`;
    const cacheControl = 'private, max-age=86400';

    if (hasMatchingEtag(req.headers['if-none-match'], etag)) {
      res.writeHead(304, { ETag: etag, 'Cache-Control': cacheControl });
      res.end();
      return;
    }

    const image = await getImage(url, key);

    if (!image) {
      sendJson(res, 404, { error: 'Image unavailable' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': image.contentType,
      'Content-Length': image.size,
      'Content-Disposition': 'inline',
      'Cache-Control': cacheControl,
      ETag: etag
    });

    pipeFile(res, filePath(key));
  };
};

const imageProxyRouteHandler = createImageProxyHandler();

export { createImageProxyHandler, imageProxyRouteHandler };
