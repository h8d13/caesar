import http from 'http';
import z from 'zod';
import { config } from '../config';
import { getWsInfo } from '../helpers/get-ws-info';
import { logger } from '../logger';
import { healthRouteHandler } from './healthz';
import {
  buildCsp,
  getRequestPathname,
  hasPrefixPathSegment,
  type HttpRouteHandler
} from './helpers';
import { infoRouteHandler } from './info';
import { interfaceRouteHandler } from './interface';
import { loginRouteHandler } from './login';
import { publicRouteHandler } from './public';
import { uploadFileRouteHandler } from './upload';
import { HttpValidationError } from './utils';

type RouteContext = {
  info: ReturnType<typeof getWsInfo>;
};

type SupportedMethod = 'GET' | 'POST';

const routeHandlers: Partial<
  Record<
    SupportedMethod,
    {
      exact: Record<string, HttpRouteHandler<RouteContext>>;
      prefix: Record<string, HttpRouteHandler<RouteContext>>;
    }
  >
> = {
  GET: {
    exact: {
      '/healthz': (req, res) => healthRouteHandler(req, res),
      '/info': (req, res) => infoRouteHandler(req, res)
    },
    prefix: {
      '/public': (req, res) => publicRouteHandler(req, res)
    }
  },
  POST: {
    exact: {
      '/upload': (req, res) => uploadFileRouteHandler(req, res),
      '/login': (req, res) => loginRouteHandler(req, res)
    },
    prefix: {}
  }
};

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
        res.setHeader('Content-Security-Policy', buildCsp());
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

        const info = getWsInfo(undefined, req);

        logger.debug(`[HTTP] ${req.method} ${req.url} - ${info?.ip}`);

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const pathname = getRequestPathname(req);

        if (!pathname) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bad request' }));
          return;
        }

        try {
          const method = req.method as SupportedMethod | undefined;

          if (method) {
            const methodHandlers = routeHandlers[method];

            if (methodHandlers) {
              const exactHandler = methodHandlers.exact[pathname];

              if (exactHandler) {
                return await exactHandler(req, res, { info });
              }

              for (const [prefix, prefixHandler] of Object.entries(
                methodHandlers.prefix
              )) {
                if (hasPrefixPathSegment(pathname, prefix)) {
                  return await prefixHandler(req, res, { info });
                }
              }
            }
          }

          // fallback to interface route handler for GET requests
          if (method === 'GET') {
            return await interfaceRouteHandler(req, res);
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

            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ errors: errorsMap }));
            return;
          } else if (error instanceof HttpValidationError) {
            errorsMap[error.field] = error.message;

            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ errors: errorsMap }));
            return;
          }

          logger.error('HTTP route error:', error);

          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    );

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
