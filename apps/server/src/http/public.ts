import { files } from '@caesar/shared/db/schema';
import { eq, sql } from 'drizzle-orm';
import fs from 'fs';
import type http from 'http';
import path from 'path';
import { config } from '../config';
import { db } from '../db';
import { prepared } from '../db/prepared';
import { getFileChannel, isFileOrphaned } from '../db/queries/files';
import { getSettings } from '../db/queries/server';
import { getSessionUserByToken } from '../db/queries/users';
import { verifyFileToken } from '../helpers/files-crypto';
import { PUBLIC_PATH } from '../helpers/paths';
import { getSessionToken } from '../helpers/session-token';
import { createRateLimiter } from '../utils/rate-limiters/rate-limiter';
import {
  buildEtag,
  safeDecodeURIComponent,
  sendNotModified,
  sendJson,
  pipeFile
} from './helpers';
import { enforceHttpRateLimit } from './rate-limit';

const fileByNameQuery = prepared(() =>
  db
    .select()
    .from(files)
    .where(eq(files.name, sql.placeholder('name')))
);

const publicFileRateLimiter = createRateLimiter({
  maxRequests: config.rateLimiters.publicFile.maxRequests,
  windowMs: config.rateLimiters.publicFile.windowMs
});

// Types a browser decodes as passive media. Everything else is served
// `attachment` so a direct navigation cannot execute uploaded content
// (see f0bb0150). Never add a type the browser can script from: no
// text/html, no image/svg+xml, no application/*.
const inlineMimeAllowlist = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'video/mp4',
  'audio/mpeg',
  // containers MediaRecorder produces for voice messages
  'audio/webm',
  'audio/ogg',
  'audio/mp4'
]);

type ByteRange = { start: number; end: number };

// RFC 9110 14.1.2: a suffix range ("-N") is the last N bytes and an end
// past EOF is clamped. Returns null to ignore Range (multi-range, which
// would need multipart/byteranges) and 'unsatisfiable' for a 416.
const parseRange = (
  header: string,
  size: number
): ByteRange | 'unsatisfiable' | null => {
  if (header.includes(',')) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header);

  if (!match || (!match[1] && !match[2])) return 'unsatisfiable';

  if (!match[1]) {
    const suffix = Number(match[2]);

    if (suffix === 0 || size === 0) return 'unsatisfiable';

    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;

  if (start >= size || start > end) return 'unsatisfiable';

  return { start, end };
};

const publicRouteHandler = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  if (!req.url) {
    sendJson(res, 400, { error: 'Bad request' });
    return;
  }

  // rate-limit by client IP before any DB work so unauth spam pays nothing
  if (!enforceHttpRateLimit(req, res, publicFileRateLimiter, '/public')) {
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const fileName = safeDecodeURIComponent(path.basename(url.pathname));

  if (fileName === null) {
    sendJson(res, 400, { error: 'Bad request' });
    return;
  }

  const dbFile = await fileByNameQuery().get({ name: fileName });

  if (!dbFile) {
    sendJson(res, 404, { error: 'File not found' });
    return;
  }

  // server logo is the only truly public file (shown on login screen)
  const isServerLogo = (await getSettings()).logoId === dbFile.id;

  // Avatars, emojis and attachments arrive by the hundred after a join, so
  // the gate reads only what it decides on. Status order stays orphan 404,
  // then 401, then 403.
  if (!isServerLogo) {
    const [channel, user] = await Promise.all([
      getFileChannel(dbFile.id),
      getSessionUserByToken(getSessionToken(req))
    ]);

    // a message link already references the file, so the full orphan
    // check only runs for everything else
    if (!channel && (await isFileOrphaned(dbFile.id))) {
      sendJson(res, 404, { error: 'File not found' });
      return;
    }

    if (!user) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }

    // private channel files additionally require a file-specific access token
    if (channel?.private) {
      const accessToken = url.searchParams.get('accessToken');
      const isValidToken = verifyFileToken(
        dbFile.id,
        channel.fileAccessToken,
        accessToken || ''
      );

      if (!isValidToken) {
        sendJson(res, 403, { error: 'Forbidden' });
        return;
      }
    }
  }

  const filePath = path.join(PUBLIC_PATH, dbFile.name);

  const stat = await fs.promises.stat(filePath).catch((err) => {
    if (err.code === 'ENOENT') return null;
    throw err;
  });

  if (!stat) {
    sendJson(res, 404, { error: 'File not found on disk' });
    return;
  }

  // Uploaded files are content-immutable: the name is server-assigned and a
  // re-upload produces a new name. private (not public) because access is
  // auth-gated and, for private channels, also file-token-gated.
  const etag = buildEtag(null, stat);
  const lastModified = stat.mtime.toUTCString();
  const cacheControl = 'private, max-age=31536000, immutable';

  const range = req.headers.range
    ? parseRange(req.headers.range, stat.size)
    : null;

  if (range === 'unsatisfiable') {
    res.writeHead(416, {
      'Content-Range': `bytes */${stat.size}`
    });
    res.end();
    return;
  }

  // 304 only applies to full responses; range requests get fresh 206 bodies.
  if (
    !range &&
    sendNotModified(req, res, {
      etag,
      lastModified,
      cacheControl,
      mtimeMs: stat.mtimeMs
    })
  ) {
    return res;
  }

  const contentDisposition = inlineMimeAllowlist.has(dbFile.mimeType)
    ? 'inline'
    : 'attachment';

  // the logo is served pre-auth: keep the uploader's original name private
  const dispositionName = isServerLogo ? dbFile.name : dbFile.originalName;

  // plain filename= is the ASCII fallback (filename* carries the real name):
  // Node rejects header chars outside latin1, so a CJK/emoji name 500'd
  const safeFileName = dispositionName
    .replace(/[^\x20-\x7e]/g, '_') // also strips CR/LF (header injection)
    .replace(/"/g, '\\"'); // escape double quotes for header safety

  const encodedFileName = encodeURIComponent(dispositionName).replace(
    /'/g,
    '%27'
  );

  const dispositionHeader = `${contentDisposition}; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`;

  if (range) {
    const { start, end } = range;
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

    pipeFile(res, filePath, { range });
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

    pipeFile(res, filePath);
  }

  return res;
};

export { publicRouteHandler };
