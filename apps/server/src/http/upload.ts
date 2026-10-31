import { UploadHeaders } from '@caesar/shared';
import { createHash } from 'crypto';
import fs from 'fs';
import type http from 'http';
import { finished, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import z from 'zod';
import { config } from '../config';
import { getSettings } from '../db/queries/server';
import { getSessionUserByToken } from '../db/queries/users';
import { getSessionToken } from '../helpers/session-token';
import { logger } from '../logger';
import { fileManager } from '../utils/file-manager';
import { createRateLimiter } from '../utils/rate-limiters/rate-limiter';
import { sanitizeFileName, sendJson } from './helpers';
import { enforceHttpRateLimit } from './rate-limit';
import { PayloadTooLargeError } from './utils';

const zHeaders = z.object({
  // browsers authenticate with the session cookie; API clients may still
  // send the token header
  [UploadHeaders.TOKEN]: z.string().optional(),
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
  if (!enforceHttpRateLimit(req, res, uploadFileRateLimiter, '/upload')) {
    return;
  }

  const parsedHeaders = zHeaders.parse(req.headers);

  const [token, rawOriginalName, contentLength] = [
    getSessionToken(req),
    parsedHeaders[UploadHeaders.ORIGINAL_NAME],
    parsedHeaders[UploadHeaders.CONTENT_LENGTH]
  ];

  const originalName = sanitizeFileName(rawOriginalName);

  if (!originalName) {
    req.resume();
    sendJson(res, 400, { error: 'Invalid file name' });
    return;
  }

  const user = await getSessionUserByToken(token);

  if (!user) {
    req.resume();
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  const settings = await getSettings();

  if (contentLength > settings.storageUploadMaxFileSize) {
    req.resume();
    req.on('end', () => {
      sendJson(res, 413, {
        error: `File ${originalName} exceeds the maximum allowed size`
      });
    });

    return;
  }

  if (!settings.storageUploadEnabled) {
    req.resume();
    req.on('end', () => {
      sendJson(res, 403, { error: 'File uploads are disabled on this server' });
    });

    return;
  }

  const safePath = await fileManager.getSafeUploadPath(originalName);
  const maxSize = settings.storageUploadMaxFileSize;
  const hash = createHash('md5');
  let bytesReceived = 0;

  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytesReceived += chunk.length;

      // the header is client-supplied; this is the real limit
      if (bytesReceived > maxSize) {
        callback(
          new PayloadTooLargeError(
            `File ${originalName} exceeds the maximum allowed size`
          )
        );
        return;
      }

      hash.update(chunk);
      callback(null, chunk);
    }
  });

  // req stays out of the pipeline: destroying it would close the socket
  // before the 413/500 is written. Node drains the unread rest after the
  // response; a client abort still tears the pipeline down.
  finished(req, (err) => {
    if (err) meter.destroy(err);
  });
  req.pipe(meter);

  try {
    await pipeline(meter, fs.createWriteStream(safePath));
  } catch (error) {
    await fs.promises.rm(safePath, { force: true });

    // client went away: nobody left to answer
    if (req.destroyed) return;
    if (error instanceof PayloadTooLargeError) throw error;

    logger.error('Error uploading file:', error);
    sendJson(res, 500, { error: 'File upload failed' });
    return;
  }

  try {
    const tempFile = await fileManager.addTemporaryFile({
      originalName,
      filePath: safePath,
      size: bytesReceived,
      md5: hash.digest('hex'),
      userId: user.id
    });

    sendJson(res, 200, tempFile);
  } catch (error) {
    logger.error('Error processing uploaded file:', error);
    sendJson(res, 500, { error: 'File processing failed' });
  }
};

export { sanitizeFileName, uploadFileRouteHandler };
