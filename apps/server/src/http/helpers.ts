import type fs from 'fs';
import http from 'http';
import path from 'path';
import { PayloadTooLargeError } from './utils';

type HttpRouteHandler<TContext = undefined> = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: TContext
) => Promise<unknown> | unknown;

// Fallback cap when a caller doesn't pass one. Callers should pass
// config.server.maxRequestBodyBytes; this keeps helpers.ts config-free (and
// cheap to unit-test) while still failing closed if a cap is ever omitted.
const DEFAULT_MAX_JSON_BODY_BYTES = 64 * 1024;

const getJsonBody = async <T = unknown>(
  req: http.IncomingMessage,
  maxBytes: number = DEFAULT_MAX_JSON_BODY_BYTES
): Promise<T> => {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    let settled = false;

    req.on('data', (chunk) => {
      if (settled) return;

      // Count actual received bytes, not the spoofable Content-Length.
      size +=
        typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;

      if (size > maxBytes) {
        settled = true;
        // Stop reading so an attacker can't keep streaming into memory.
        if (typeof req.destroy === 'function') req.destroy();
        reject(new PayloadTooLargeError());
        return;
      }

      body += chunk;
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;

      try {
        const json = body ? JSON.parse(body) : {};
        resolve(json);
      } catch (err) {
        reject(err);
      }
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
};

const hasPrefixPathSegment = (pathname: string, prefix: string): boolean => {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
};

const getRequestPathname = (req: http.IncomingMessage): string | null => {
  if (!req.url) return null;

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    return url.pathname;
  } catch {
    return null;
  }
};

const sanitizeFileName = (name: string): string | null => {
  // reject null bytes which can truncate paths on some
  if (name.includes('\0')) {
    return null;
  }

  const normalized = name.replace(/\\/g, '/');

  // strip any directory components (e.g. "../../etc/passwd" -> "passwd")
  const baseName = path.basename(normalized);

  // reject empty names (e.g. after stripping path components from "/")
  if (!baseName || baseName === '.' || baseName === '..') {
    return null;
  }

  return baseName;
};

const buildCsp = (nonce?: string): string => {
  const scriptSrc = nonce
    ? `'self' blob: data: 'wasm-unsafe-eval' 'nonce-${nonce}'`
    : "'self' blob: data: 'wasm-unsafe-eval'";
  const styleSrc = "'self' 'unsafe-inline'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "img-src 'self' data: blob: https:",
    // api.giphy.com: keyless GIF search from the client-side picker
    "connect-src 'self' wss: ws: https://api.giphy.com",
    "media-src 'self' blob:",
    "font-src 'self'",
    'frame-src https://www.youtube-nocookie.com',
    "frame-ancestors 'none'"
  ].join('; ');
};

const buildEtag = (md5: string | null, stat: fs.Stats) => {
  if (md5) {
    return `"${md5}"`;
  }

  return `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
};

const hasMatchingEtag = (
  ifNoneMatchHeader: string | undefined,
  etag: string
) => {
  if (!ifNoneMatchHeader) {
    return false;
  }

  const candidates = ifNoneMatchHeader.split(',').map((part) => part.trim());

  return candidates.includes('*') || candidates.includes(etag);
};

const isNotModifiedByDate = (
  ifModifiedSinceHeader: string | undefined,
  mtimeMs: number
) => {
  if (!ifModifiedSinceHeader) {
    return false;
  }

  const ifModifiedSinceTime = Date.parse(ifModifiedSinceHeader);

  if (Number.isNaN(ifModifiedSinceTime)) {
    return false;
  }

  // HTTP dates are second-precision; truncate mtime for accurate comparisons.
  return Math.floor(mtimeMs / 1000) * 1000 <= ifModifiedSinceTime;
};

type CacheMetadata = {
  etag: string;
  lastModified: string;
  cacheControl: string;
  mtimeMs: number;
  extraHeaders?: Record<string, string>;
};

// RFC 7232 §6: when If-None-Match is present, If-Modified-Since is ignored.
const sendNotModified = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  meta: CacheMetadata
): boolean => {
  const ifNoneMatchHeader = req.headers['if-none-match'];
  const ifModifiedSinceHeader = req.headers['if-modified-since'];

  const isNotModified = ifNoneMatchHeader
    ? hasMatchingEtag(ifNoneMatchHeader, meta.etag)
    : isNotModifiedByDate(ifModifiedSinceHeader, meta.mtimeMs);

  if (!isNotModified) {
    return false;
  }

  res.writeHead(304, {
    ETag: meta.etag,
    'Last-Modified': meta.lastModified,
    'Cache-Control': meta.cacheControl,
    ...meta.extraHeaders
  });
  res.end();

  return true;
};

export {
  buildCsp,
  buildEtag,
  getJsonBody,
  getRequestPathname,
  hasPrefixPathSegment,
  sanitizeFileName,
  sendNotModified
};
export type { HttpRouteHandler };
