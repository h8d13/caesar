import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import mime from 'mime-types';
import path from 'path';
import zlib from 'zlib';
import { INTERFACE_PATH } from '../helpers/paths';
import { logger } from '../logger';
import { IS_DEVELOPMENT, IS_TEST } from '../utils/env';
import { buildCsp, buildEtag, sendNotModified } from './helpers';

const COMPRESSIBLE_TYPES = new Set([
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/json',
  'image/svg+xml',
  'text/plain',
  'text/xml',
  'application/xml'
]);

// Suffixes written by the client's precompress vite plugin.
const ENCODING_EXTENSIONS = { br: '.br', gzip: '.gz' } as const;

type Encoding = keyof typeof ENCODING_EXTENSIONS;

// Quality 11 (the brotli default) costs ~1.3s of CPU on the largest chunk and
// would be recomputed per request, so it belongs in the build plugin. Quality
// 5 is 12% larger and 36x cheaper: the right trade for the fallback path.
const RUNTIME_BROTLI_QUALITY = 5;

const createCompressor = (encoding: Encoding, sizeHint: number) => {
  if (encoding === 'gzip') return zlib.createGzip();

  return zlib.createBrotliCompress({
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: RUNTIME_BROTLI_QUALITY,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: sizeHint
    }
  });
};

// A substring test would accept "br;q=0", which is a client refusing brotli.
// Parse the q-values instead and drop anything explicitly disabled.
const acceptsEncoding = (accept: string, encoding: string): boolean => {
  for (const part of accept.split(',')) {
    const [name, ...params] = part.trim().split(';');

    if (name?.trim().toLowerCase() !== encoding) continue;

    const q = params
      .map((p) => p.trim().match(/^q=(.+)$/i)?.[1])
      .find((value) => value !== undefined);

    return q === undefined || parseFloat(q) > 0;
  }

  return false;
};

const getEncoding = (req: http.IncomingMessage): Encoding | null => {
  const accept = req.headers['accept-encoding'] || '';
  if (acceptsEncoding(accept, 'br')) return 'br';
  if (acceptsEncoding(accept, 'gzip')) return 'gzip';
  return null;
};

// Resolves the build-time sibling, or null when the build did not emit one
// (file below the plugin's size floor, or it failed to shrink).
const statPrecompressed = (
  filePath: string,
  encoding: Encoding,
  sourceMtimeMs: number
) => {
  try {
    const stat = fs.statSync(filePath + ENCODING_EXTENSIONS[encoding]);

    if (!stat.isFile()) return null;

    // A sibling older than its source is stale: the ETag comes from the
    // source, so serving it would hand back old bytes under a fresh tag.
    return stat.mtimeMs >= sourceMtimeMs ? stat : null;
  } catch {
    return null;
  }
};

const interfaceRouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  if (IS_DEVELOPMENT && !IS_TEST) {
    res.writeHead(302, { Location: 'http://localhost:5173' });
    res.end();
    return res;
  }

  let subPath = req.url || '/';

  const urlPart = subPath.split('?')[0];

  subPath = urlPart ? decodeURIComponent(urlPart) : '/';
  subPath = subPath === '/' ? 'index.html' : subPath;

  const cleanSubPath = subPath.startsWith('/') ? subPath.slice(1) : subPath;

  const requestedPath = path.resolve(INTERFACE_PATH, cleanSubPath);
  const basePath = path.resolve(INTERFACE_PATH);

  if (!requestedPath.startsWith(basePath)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return res;
  }

  if (!fs.existsSync(requestedPath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return res;
  }

  const stats = fs.statSync(requestedPath);

  if (stats.isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return res;
  }

  const encoding = getEncoding(req);

  if (cleanSubPath === 'index.html') {
    try {
      const html = fs.readFileSync(requestedPath, 'utf-8');
      const nonce = crypto.randomBytes(16).toString('base64');
      const nonced = html.replace(/<script/g, `<script nonce="${nonce}"`);

      res.setHeader('Content-Security-Policy', buildCsp(nonce));
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Vary', 'Accept-Encoding');

      if (encoding) {
        const body = Buffer.from(nonced);
        // Cannot be precompressed: the CSP nonce is fresh per request.
        const compressed =
          encoding === 'br'
            ? zlib.brotliCompressSync(body, {
                params: {
                  [zlib.constants.BROTLI_PARAM_QUALITY]: RUNTIME_BROTLI_QUALITY,
                  [zlib.constants.BROTLI_PARAM_SIZE_HINT]: body.length
                }
              })
            : zlib.gzipSync(body);

        res.writeHead(200, {
          'Content-Type': 'text/html',
          'Content-Encoding': encoding,
          'Content-Length': compressed.length
        });
        res.end(compressed);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(nonced);
      }
    } catch (err) {
      logger.error('Error serving index.html:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
    return res;
  }

  // Static assets hashed filenames (assets/) can be cached immutably
  const isHashed = cleanSubPath.startsWith('assets/');
  const cacheControl = isHashed
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=3600';

  const contentType = mime.lookup(requestedPath) || 'application/octet-stream';
  const baseType = contentType.split(';')[0]?.trim() || '';
  // Narrowed so the branches below get a non-null Encoding.
  const compressWith =
    encoding && COMPRESSIBLE_TYPES.has(baseType) ? encoding : null;

  const precompressedStats = compressWith
    ? statPrecompressed(requestedPath, compressWith, stats.mtimeMs)
    : null;

  // index.html gets no ETag because the nonce is injected fresh per response,
  // so the byte stream differs even when the source file is unchanged.
  // Compressed responses tag the encoding so the variants stay distinct.
  const etag = buildEtag(null, stats, compressWith ?? undefined);
  const lastModified = stats.mtime.toUTCString();

  if (
    sendNotModified(req, res, {
      etag,
      lastModified,
      cacheControl,
      mtimeMs: stats.mtimeMs,
      extraHeaders: compressWith ? { Vary: 'Accept-Encoding' } : undefined
    })
  ) {
    return res;
  }

  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', lastModified);

  if (compressWith) {
    res.setHeader('Vary', 'Accept-Encoding');

    // Prefer the build-time sibling: no compression work, and Content-Length
    // is known so the response is not chunked.
    if (precompressedStats) {
      const fileStream = fs.createReadStream(
        requestedPath + ENCODING_EXTENSIONS[compressWith]
      );

      fileStream.on('open', () => {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Encoding': compressWith,
          'Content-Length': precompressedStats.size
        });
        fileStream.pipe(res);
      });

      fileStream.on('error', (err) => {
        logger.error('Error serving precompressed file:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        } else {
          res.destroy();
        }
      });

      res.on('close', () => {
        fileStream.destroy();
      });

      return res;
    }

    const compress = createCompressor(compressWith, stats.size);
    const fileStream = fs.createReadStream(requestedPath);

    fileStream.on('open', () => {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Encoding': compressWith
      });
      fileStream.pipe(compress).pipe(res);
    });

    fileStream.on('error', (err) => {
      logger.error('Error serving file:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      } else {
        res.destroy();
      }
    });

    compress.on('error', (err) => {
      logger.error('Compression error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      } else {
        res.destroy();
      }
    });

    res.on('close', () => {
      fileStream.destroy();
      compress.destroy();
    });
  } else {
    const fileStream = fs.createReadStream(requestedPath);

    fileStream.on('open', () => {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stats.size
      });
      fileStream.pipe(res);
    });

    fileStream.on('error', (err) => {
      logger.error('Error serving file:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      } else {
        res.destroy();
      }
    });

    res.on('close', () => {
      fileStream.destroy();
    });
  }

  return res;
};

export { interfaceRouteHandler };
