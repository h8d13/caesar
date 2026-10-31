import http from 'http';
import z from 'zod';
import { config } from '../config';
import { getRequestIp } from '../helpers/get-ws-info';
import { isCrossOrigin } from '../helpers/session-token';
import { logger } from '../logger';
import {
  getE2eeSessionKeyRouteHandler,
  storeE2eeSessionKeyRouteHandler
} from './e2ee-session-key';
import { healthRouteHandler } from './healthz';
import {
  buildCsp,
  getRequestPathname,
  hasPrefixPathSegment,
  type HttpRouteHandler,
  sendJson
} from './helpers';
import { infoRouteHandler } from './info';
import { interfaceRouteHandler } from './interface';
import { loginRouteHandler } from './login';
import { login2faRouteHandler } from './login-2fa';
import { logoutRouteHandler } from './logout';
import { publicRouteHandler } from './public';
import { sessionRefreshRouteHandler } from './session-refresh';
import { uploadFileRouteHandler } from './upload';
import { HttpValidationError, PayloadTooLargeError } from './utils';

type SupportedMethod = 'GET' | 'POST';

const routeHandlers: Partial<
  Record<
    SupportedMethod,
    {
      exact: Record<string, HttpRouteHandler>;
      prefix: Record<string, HttpRouteHandler>;
    }
  >
> = {
  GET: {
    exact: {
      '/healthz': healthRouteHandler,
      '/info': infoRouteHandler,
      '/e2ee/session-key': getE2eeSessionKeyRouteHandler
    },
    prefix: {
      '/public': publicRouteHandler
    }
  },
  POST: {
    exact: {
      '/upload': uploadFileRouteHandler,
      '/login': loginRouteHandler,
      '/login/2fa': login2faRouteHandler,
      '/logout': logoutRouteHandler,
      '/session/refresh': sessionRefreshRouteHandler,
      '/e2ee/session-key': storeE2eeSessionKeyRouteHandler
    },
    prefix: {}
  }
};

// constant without a nonce; only index.html gets a per-response policy
const CSP = buildCsp();

// this http server implementation is temporary and will be moved to a more capable framework later

const createHttpServer = async (port: number = config.server.port) => {
  return new Promise<http.Server>((resolve) => {
    const server = http.createServer(
      async (req: http.IncomingMessage, res: http.ServerResponse) => {
        const host = req.headers.host;

        // Security headers. caesar is same-origin only (client + API behind
        // the same Caddy host), so no CORS allow-* is needed. Dropping
        // them reduces attack surface for cross-origin probes.
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader(
          'Strict-Transport-Security',
          'max-age=31536000; includeSubDomains'
        );
        res.setHeader('Content-Security-Policy', CSP);
        // Restrict powerful features. caesar uses mic + cam + screen
        // capture; everything else is explicitly denied so nested iframes
        // (e.g. the youtube embed) can't request them.
        res.setHeader(
          'Permissions-Policy',
          'camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(), usb=(), midi=()'
        );
        // Process isolation + resource scope. COOP isolates the browsing
        // context from cross-origin openers; CORP prevents other origins
        // from loading caesar resources via <img>/<script>/etc.
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

        // Redirect HTTP to HTTPS when behind a reverse proxy
        const forwardedProto = req.headers['x-forwarded-proto'];
        if (forwardedProto === 'http' && host) {
          res.writeHead(301, { Location: `https://${host}${req.url}` });
          res.end();
          return;
        }

        if (config.server.debug) {
          logger.debug(
            `[HTTP] ${req.method} ${req.url} - ${getRequestIp(req)}`
          );
        }

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const pathname = getRequestPathname(req);

        if (!pathname) {
          sendJson(res, 400, { error: 'Bad request' });
          return;
        }

        // CSRF: every POST either sets the session cookie (/login,
        // /login/2fa, /session/refresh) or acts on it, so only our own page
        // may send one. API clients send no Origin and pass.
        if (req.method === 'POST' && isCrossOrigin(req)) {
          req.resume();
          sendJson(res, 403, { error: 'Forbidden origin' });
          return;
        }

        try {
          const method = req.method as SupportedMethod | undefined;

          if (method) {
            const methodHandlers = routeHandlers[method];

            if (methodHandlers) {
              const exactHandler = methodHandlers.exact[pathname];

              if (exactHandler) {
                return await exactHandler(req, res);
              }

              for (const [prefix, prefixHandler] of Object.entries(
                methodHandlers.prefix
              )) {
                if (hasPrefixPathSegment(pathname, prefix)) {
                  return await prefixHandler(req, res);
                }
              }
            }
          }

          // fallback to interface route handler for GET requests
          if (method === 'GET') {
            return interfaceRouteHandler(req, res);
          }
        } catch (error) {
          const errorsMap: Record<string, string> = {};

          if (error instanceof z.ZodError) {
            for (const issue of error.issues) {
              const field = issue.path[0];

              if (typeof field === 'string') {
                errorsMap[field] = issue.message;
              }
            }

            sendJson(res, 400, { errors: errorsMap });
            return;
          } else if (error instanceof HttpValidationError) {
            errorsMap[error.field] = error.message;

            sendJson(res, 400, { errors: errorsMap });
            return;
          } else if (error instanceof PayloadTooLargeError) {
            sendJson(res, 413, { error: error.message });
            return;
          }

          logger.error('HTTP route error:', error);

          sendJson(res, 500, { error: 'Internal server error' });
          return;
        }

        sendJson(res, 404, { error: 'Not found' });
      }
    );

    // Caddy reuses idle upstream connections for up to 2m; Node's 5s
    // default closes them first, and a request racing that close fails
    // with a 502 (POSTs are not retried). Let the proxy close first.
    server.keepAliveTimeout = 125_000;

    server.on('listening', () => {
      logger.debug('HTTP server is listening on port %d', port);
      resolve(server);
    });

    server.on('close', () => {
      logger.debug('HTTP server closed');
      // Under vitest, the worker reuses one server across test files; the
      // server may close during teardown/restart cycles. Exiting on close
      // there kills the worker mid-suite and aborts remaining files.
      if (process.env.NODE_ENV !== 'test') {
        process.exit(0);
      }
    });

    server.listen(port);
  });
};

export { createHttpServer };
