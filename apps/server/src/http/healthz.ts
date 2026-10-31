import type http from 'http';
import { sendJson } from './helpers';

const healthRouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  sendJson(res, 200, { status: 'ok', timestamp: Date.now() });
};

export { healthRouteHandler };
