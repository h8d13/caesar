import http from 'http';
import path from 'path';

type HttpRouteHandler<TContext = undefined> = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: TContext
) => Promise<unknown> | unknown;

const getJsonBody = async <T = unknown>(
  req: http.IncomingMessage
): Promise<T> => {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      try {
        const json = body ? JSON.parse(body) : {};
        resolve(json);
      } catch (err) {
        reject(err);
      }
    });

    req.on('error', reject);
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
    ? `'self' blob: data: 'unsafe-eval' 'nonce-${nonce}'`
    : "'self' blob: data: 'unsafe-eval'";
  const styleSrc = "'self' 'unsafe-inline'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "img-src 'self' data: blob: https:",
    "connect-src 'self' wss: ws:",
    "media-src 'self' blob:",
    "font-src 'self'",
    'frame-src https://www.youtube-nocookie.com',
    "frame-ancestors 'none'"
  ].join('; ');
};

export {
  buildCsp,
  getJsonBody,
  getRequestPathname,
  hasPrefixPathSegment,
  sanitizeFileName
};
export type { HttpRouteHandler };
