import { UploadHeaders } from '@caesar/shared';
import fs from 'fs';
import http from 'http';
import z from 'zod';
import { config } from '../config';
import { getSettings } from '../db/queries/server';
import { getUserByToken } from '../db/queries/users';
import { getWsInfo } from '../helpers/get-ws-info';
import { logger } from '../logger';
import { fileManager } from '../utils/file-manager';
import {
  createRateLimiter,
  getClientRateLimitKey,
  getRateLimitRetrySeconds
} from '../utils/rate-limiters/rate-limiter';
import { sanitizeFileName } from './helpers';

const zHeaders = z.object({
  [UploadHeaders.TOKEN]: z.string(),
  [UploadHeaders.ORIGINAL_NAME]: z.string(),
  [UploadHeaders.CONTENT_LENGTH]: z.string().transform((val) => Number(val))
});

const uploadFileRateLimiter = createRateLimiter({
  maxRequests: config.rateLimiters.uploadFile.maxRequests,
  windowMs: config.rateLimiters.uploadFile.windowMs
});

const uploadFileRouteHandler = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  // rate-limit by client IP before any DB / disk work
  const connectionInfo = getWsInfo(undefined, req);

  if (connectionInfo?.ip) {
    const key = getClientRateLimitKey(connectionInfo.ip);
    const rateLimit = uploadFileRateLimiter.consume(key);

    if (!rateLimit.allowed) {
      req.resume();
      logger.debug(`[Rate Limiter HTTP] /upload rate limited for key "${key}"`);

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
      '[Rate Limiter HTTP] Missing IP address in request info, skipping rate limiting for /upload route.'
    );
  }

  const parsedHeaders = zHeaders.parse(req.headers);

  const [token, rawOriginalName, contentLength] = [
    parsedHeaders[UploadHeaders.TOKEN],
    parsedHeaders[UploadHeaders.ORIGINAL_NAME],
    parsedHeaders[UploadHeaders.CONTENT_LENGTH]
  ];

  const originalName = sanitizeFileName(rawOriginalName);

  if (!originalName) {
    req.resume();
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid file name' }));
    return;
  }

  const user = await getUserByToken(token);

  if (!user) {
    req.resume();
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  const settings = await getSettings();

  if (contentLength > settings.storageUploadMaxFileSize) {
    req.resume();
    req.on('end', () => {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: `File ${originalName} exceeds the maximum allowed size`
        })
      );
    });

    return;
  }

  if (!settings.storageUploadEnabled) {
    req.resume();
    req.on('end', () => {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ error: 'File uploads are disabled on this server' })
      );
    });

    return;
  }

  const safePath = await fileManager.getSafeUploadPath(originalName);
  const fileStream = fs.createWriteStream(safePath);
  const maxSize = settings.storageUploadMaxFileSize;
  let bytesReceived = 0;
  let limitExceeded = false;

  req.on('data', (chunk: Buffer) => {
    bytesReceived += chunk.length;

    if (!limitExceeded && bytesReceived > maxSize) {
      limitExceeded = true;
      req.unpipe(fileStream);
      req.resume();
      fileStream.destroy();
      fs.unlink(safePath, () => {});
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: `File ${originalName} exceeds the maximum allowed size`
        })
      );
    }
  });

  req.pipe(fileStream);

  fileStream.on('finish', async () => {
    if (limitExceeded) return;

    try {
      const tempFile = await fileManager.addTemporaryFile({
        originalName,
        filePath: safePath,
        size: bytesReceived,
        userId: user.id
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tempFile));
    } catch (error) {
      logger.error('Error processing uploaded file:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'File processing failed' }));
    }
  });

  fileStream.on('error', (err) => {
    if (limitExceeded) return;

    logger.error('Error uploading file:', err);

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File upload failed' }));
  });
};

export { sanitizeFileName, uploadFileRouteHandler };
