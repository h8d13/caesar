import { channels, files } from '@caesar/shared/db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { config } from '../config';
import { db } from '../db';
import { isFileOrphaned } from '../db/queries/files';
import { getMessageByFileId } from '../db/queries/messages';
import { getSettings } from '../db/queries/server';
import { getUserByToken } from '../db/queries/users';
import { verifyFileToken } from '../helpers/files-crypto';
import { getWsInfo } from '../helpers/get-ws-info';
import { PUBLIC_PATH } from '../helpers/paths';
import { logger } from '../logger';
import {
  createRateLimiter,
  getClientRateLimitKey,
  getRateLimitRetrySeconds
} from '../utils/rate-limiters/rate-limiter';
import { buildEtag, sendNotModified } from './helpers';

const publicFileRateLimiter = createRateLimiter({
  maxRequests: config.rateLimiters.publicFile.maxRequests,
  windowMs: config.rateLimiters.publicFile.windowMs
});

const pipeFileStream = (
  filePath: string,
  res: http.ServerResponse,
  streamOptions?: { start: number; end: number }
) => {
  const fileStream = fs.createReadStream(filePath, streamOptions);

  fileStream.pipe(res);

  fileStream.on('error', (err) => {
    logger.error('Error serving file:', err);

    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  res.on('close', () => {
    fileStream.destroy();
  });

  fileStream.on('end', () => {
    res.end();
  });
};

const publicRouteHandler = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  if (!req.url) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad request' }));
    return;
  }

  // rate-limit by client IP before any DB work so unauth spam pays nothing
  const connectionInfo = getWsInfo(undefined, req);

  if (connectionInfo?.ip) {
    const key = getClientRateLimitKey(connectionInfo.ip);
    const rateLimit = publicFileRateLimiter.consume(key);

    if (!rateLimit.allowed) {
      logger.debug(`[Rate Limiter HTTP] /public rate limited for key "${key}"`);

      res.setHeader(
        'Retry-After',
        getRateLimitRetrySeconds(rateLimit.retryAfterMs)
      );
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }
  } else {
    logger.warn(
      '[Rate Limiter HTTP] Missing IP address in request info, skipping rate limiting for /public route.'
    );
  }

  const url = new URL(req.url!, `http://${req.headers.host}`);
  const fileName = decodeURIComponent(path.basename(url.pathname));

  const dbFile = await db
    .select()
    .from(files)
    .where(eq(files.name, fileName))
    .get();

  if (!dbFile) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File not found' }));
    return;
  }

  const isOrphaned = await isFileOrphaned(dbFile.id);

  if (isOrphaned) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File not found' }));
    return;
  }

  // server logo is the only truly public file (shown on login screen)
  const serverSettings = await getSettings();
  const isServerLogo = serverSettings.logoId === dbFile.id;

  if (!isServerLogo) {
    // all non-logo files require authentication
    const token =
      (req.headers['x-token'] as string | undefined) ||
      req.headers.cookie
        ?.split('; ')
        .find((c) => c.startsWith('caesar-token='))
        ?.split('=')
        .slice(1)
        .join('=');
    const user = await getUserByToken(token || undefined);

    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // private channel files additionally require a file-specific access token
    const associatedMessage = await getMessageByFileId(dbFile.id);

    if (associatedMessage) {
      const channel = await db
        .select()
        .from(channels)
        .where(eq(channels.id, associatedMessage.channelId))
        .get();

      if (channel && channel.private) {
        const accessToken = url.searchParams.get('accessToken');
        const isValidToken = verifyFileToken(
          dbFile.id,
          channel.fileAccessToken,
          accessToken || ''
        );

        if (!isValidToken) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden' }));
          return;
        }
      }
    }
  }

  const filePath = path.join(PUBLIC_PATH, dbFile.name);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File not found on disk' }));
    return;
  }

  const stat = fs.statSync(filePath);

  // Uploaded files are content-immutable: the name is server-assigned and a
  // re-upload produces a new name. private (not public) because access is
  // auth-gated and, for private channels, also file-token-gated.
  const etag = buildEtag(null, stat);
  const lastModified = stat.mtime.toUTCString();
  const cacheControl = 'private, max-age=31536000, immutable';

  const rangeHeader = req.headers.range;

  // 304 only applies to full responses; range requests get fresh 206 bodies.
  if (
    !rangeHeader &&
    sendNotModified(req, res, {
      etag,
      lastModified,
      cacheControl,
      mtimeMs: stat.mtimeMs
    })
  ) {
    return res;
  }

  const inlineAllowlist = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/avif',
    'video/mp4',
    'audio/mpeg'
  ];

  const contentDisposition = inlineAllowlist.includes(dbFile.mimeType)
    ? 'inline'
    : 'attachment';

  const safeFileName = dbFile.originalName
    .replace(/[\r\n]/g, '') // strip CR/LF to prevent header injection
    .replace(/"/g, '\\"'); // escape double quotes for header safety

  const encodedFileName = encodeURIComponent(dbFile.originalName).replace(
    /'/g,
    '%27'
  );

  const dispositionHeader = `${contentDisposition}; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`;

  if (rangeHeader) {
    const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);

    if (!match) {
      res.writeHead(416, {
        'Content-Range': `bytes */${stat.size}`
      });
      res.end();
      return;
    }

    const start = parseInt(match[1]!, 10);
    const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;

    if (start >= stat.size || end >= stat.size || start > end) {
      res.writeHead(416, {
        'Content-Range': `bytes */${stat.size}`
      });
      res.end();
      return;
    }

    const contentLength = end - start + 1;

    res.writeHead(206, {
      'Content-Type': dbFile.mimeType,
      'Content-Length': contentLength,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Disposition': dispositionHeader,
      'Cache-Control': cacheControl,
      ETag: etag,
      'Last-Modified': lastModified
    });

    pipeFileStream(filePath, res, { start, end });
  } else {
    res.writeHead(200, {
      'Content-Type': dbFile.mimeType,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Content-Disposition': dispositionHeader,
      'Cache-Control': cacheControl,
      ETag: etag,
      'Last-Modified': lastModified
    });

    pipeFileStream(filePath, res);
  }

  return res;
};

export { publicRouteHandler };
