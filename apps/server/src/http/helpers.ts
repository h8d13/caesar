import fs from 'fs';
import type http from 'http';
import path from 'path';
import { pipeline } from 'stream';
import { logger } from '../logger';
import { PayloadTooLargeError } from './utils';

type HttpRouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => unknown;

// Fallback cap when a caller doesn't pass one. Callers should pass
// config.server.maxRequestBodyBytes; this keeps helpers.ts config-free (and
// cheap to unit-test) while still failing closed if a cap is ever omitted.
const DEFAULT_MAX_JSON_BODY_BYTES = 64 * 1024;

const getJsonBody = async <T = unknown>(
  req: http.IncomingMessage,
  maxBytes: number = DEFAULT_MAX_JSON_BODY_BYTES
): Promise<T> => {
  return new Promise((resolve, reject) => {
    // Buffers, decoded once at the end: a per-chunk toString splits
    // multi-byte UTF-8 characters that straddle a chunk boundary
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    req.on('data', (chunk: Buffer | string) => {
      if (settled) return;

      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;

      // Count actual received bytes, not the spoofable Content-Length.
      size += buffer.length;

      if (size > maxBytes) {
        settled = true;
        // Stop buffering but keep the socket: destroying req would reset
        // the connection before the 413 is written. Node discards the
        // unread rest once the response ends.
        chunks.length = 0;
        reject(new PayloadTooLargeError());
        return;
      }

      chunks.push(buffer);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;

      try {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve(body ? JSON.parse(body) : {});
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

// decodeURIComponent throws URIError on a malformed escape ("%zz"), which
// otherwise surfaces as a 500 instead of a client error.
const safeDecodeURIComponent = (value: string): string | null => {
  try {
    return decodeURIComponent(value);
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

// script-src keeps data: because Vite inlines small `?url` imports (the
// audio worklet processors) as data: URLs under assetsInlineLimit.
const buildCsp = (nonce?: string): string => {
  // blob: is the DTLN worklet (fetched, cached, loaded via object URL). No
  // data:: an injected <script src="data:..."> would run under it.
  const scriptSrc = nonce
    ? `'self' blob: 'wasm-unsafe-eval' 'nonce-${nonce}'`
    : "'self' blob: 'wasm-unsafe-eval'";
  const styleSrc = "'self' 'unsafe-inline'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "img-src 'self' data: blob: https:",
    // 'self' covers the same-origin tRPC WebSocket (ws/wss). api.giphy.com:
    // keyless GIF search from the client-side picker
    "connect-src 'self' https://api.giphy.com",
    "media-src 'self' blob:",
    "font-src 'self'",
    'frame-src https://www.youtube-nocookie.com',
    "frame-ancestors 'none'",
    // not covered by default-src: an injected <base> would re-point every
    // relative URL, a <form> could post anywhere, <object> loads plugins
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'"
  ].join('; ');
};

// `variant` distinguishes byte streams built from the same source file --
// currently Content-Encoding. Without it a br body and an identity body share
// one ETag, so a cache that ignores Vary can hand the wrong one to a client.
const buildEtag = (md5: string | null, stat: fs.Stats, variant?: string) => {
  const suffix = variant ? `-${variant}` : '';

  if (md5) {
    return `"${md5}${suffix}"`;
  }

  const size = stat.size.toString(16);
  const mtime = Math.floor(stat.mtimeMs).toString(16);

  return `W/"${size}-${mtime}${suffix}"`;
};

const hasMatchingEtag = (
  ifNoneMatchHeader: string | undefined,
  etag: string
) => {
  if (!ifNoneMatchHeader) {
    return false;
  }

  const candidates = new Set(
    ifNoneMatchHeader.split(',').map((part) => part.trim())
  );

  return candidates.has('*') || candidates.has(etag);
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

const sendJson = (
  res: http.ServerResponse,
  status: number,
  body: unknown,
  headers?: http.OutgoingHttpHeaders
) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};

// Streams a file into a response whose headers are already written.
// pipeline destroys every stream on failure, where pipe() leaves the
// destination open on a source error (Node stream docs), so a read error
// mid-body ends the response instead of leaving the client waiting.
const pipeFile = (
  res: http.ServerResponse,
  filePath: string,
  {
    range,
    transform
  }: {
    range?: { start: number; end: number };
    transform?: NodeJS.ReadWriteStream;
  } = {}
) => {
  const source = fs.createReadStream(filePath, range);
  const done = (err: NodeJS.ErrnoException | null) => {
    if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      logger.error('Error serving file:', err);
    }
  };

  if (transform) pipeline(source, transform, res, done);
  else pipeline(source, res, done);
};

export {
  buildCsp,
  buildEtag,
  getJsonBody,
  getRequestPathname,
  hasPrefixPathSegment,
  pipeFile,
  safeDecodeURIComponent,
  sanitizeFileName,
  sendJson,
  sendNotModified
};
export type { HttpRouteHandler };
