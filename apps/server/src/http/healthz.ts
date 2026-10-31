import type http from 'http';

const healthRouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
};

export { healthRouteHandler };
