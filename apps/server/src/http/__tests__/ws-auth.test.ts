import { loginToken } from '@server/__tests__/helpers';
import { createWsServer } from '@server/utils/wss';
import http from 'http';
import { afterAll, beforeAll, describe, expect, test } from 'vite-plus/test';
import { WebSocket, type WebSocketServer } from 'ws';

// the shared test server is HTTP only; stand up the real WS server on its
// own port for these tests
let server: http.Server;
let wss: WebSocketServer;
let port: number;

beforeAll(async () => {
  server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as { port: number }).port;
  wss = await createWsServer(server);
});

afterAll(async () => {
  wss.close();
  await new Promise((resolve) => server.close(resolve));
});

const host = () => `localhost:${port}`;

const open = (headers: Record<string, string>) =>
  new WebSocket(`ws://${host()}`, { headers: { host: host(), ...headers } });

// one raw tRPC query over the socket; resolves with the reply or close code
const query = (ws: WebSocket, path: string) =>
  new Promise<{ reply?: { result?: unknown; error?: unknown }; code?: number }>(
    (resolve) => {
      ws.on('open', () =>
        ws.send(JSON.stringify({ id: 1, method: 'query', params: { path } }))
      );
      ws.on('message', (data) => {
        resolve({ reply: JSON.parse((data as Buffer).toString()) });
        ws.close();
      });
      ws.on('close', (code) => resolve({ code }));
      ws.on('error', () => {});
    }
  );

describe('WebSocket session auth', () => {
  test('the session cookie authenticates the upgrade', async () => {
    const token = await loginToken('testowner', 'password123');
    const ws = open({
      origin: `https://${host()}`,
      cookie: `caesar-session=${token}`
    });

    const { reply } = await query(ws, 'others.handshake');

    expect(reply?.result).toBeDefined();
    expect(reply?.error).toBeUndefined();
  });

  test('no cookie and no connectionParams is unauthorized', async () => {
    const { reply, code } = await query(
      open({ origin: `https://${host()}` }),
      'others.handshake'
    );

    expect(reply?.result).toBeUndefined();
    expect(reply?.error ?? code).toBeDefined();
  });

  test('a cross-origin upgrade is refused even with a valid cookie', async () => {
    const token = await loginToken('testowner', 'password123');
    const { reply, code } = await query(
      open({
        origin: 'https://evil.example',
        cookie: `caesar-session=${token}`
      }),
      'others.handshake'
    );

    expect(reply?.result).toBeUndefined();
    expect(code).toBe(1008);
  });
});
