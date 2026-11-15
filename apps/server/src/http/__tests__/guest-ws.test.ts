import { GUEST_WS_PATH } from '@caesar/shared';
import { createWsServer } from '@server/utils/wss';
import http from 'http';
import { afterAll, beforeAll, describe, expect, test } from 'vite-plus/test';
import { WebSocket, type WebSocketServer } from 'ws';

// the real upgrade routing: the guest endpoint next to the main one
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
  for (const client of wss.clients) client.terminate();
  wss.close();
  await new Promise((resolve) => server.close(resolve));
});

const host = () => `localhost:${port}`;

type TReply = { result?: unknown; error?: { data?: { code?: string } } };

// one raw tRPC call over a guest socket; resolves with the reply or close code
const call = (
  method: 'query' | 'mutation',
  path: string,
  input?: unknown,
  origin = `https://${host()}`
) =>
  new Promise<{ reply?: TReply; code?: number }>((resolve) => {
    const ws = new WebSocket(`ws://${host()}${GUEST_WS_PATH}`, {
      headers: { host: host(), origin }
    });

    ws.on('open', () =>
      ws.send(JSON.stringify({ id: 1, method, params: { path, input } }))
    );
    ws.on('message', (data) => {
      resolve({ reply: JSON.parse((data as Buffer).toString()) });
      ws.close();
    });
    ws.on('close', (code) => resolve({ code }));
    ws.on('error', () => {});
  });

describe('guest WebSocket endpoint', () => {
  test('answers without a session, and only for its own procedures', async () => {
    const join = await call('mutation', 'tempRooms.joinAsGuest', {
      token: 'not-a-room',
      name: 'Eve',
      state: {}
    });

    expect(join.reply?.error?.data?.code).toBe('NOT_FOUND');

    // the main router is not reachable from here
    for (const path of ['others.handshake', 'users.getAll', 'tempRooms.list']) {
      const { reply } = await call('query', path);

      expect(reply?.error?.data?.code).toBe('NOT_FOUND');
    }

    // a shared voice procedure is there, and refuses a socket not in a room
    const voice = await call('mutation', 'voice.createProducerTransport');

    expect(voice.reply?.error?.data?.code).toBe('UNAUTHORIZED');
  });

  test('refuses another site', async () => {
    const { code } = await call(
      'mutation',
      'tempRooms.joinAsGuest',
      { token: 'x', name: 'Eve', state: {} },
      'https://evil.example'
    );

    expect(code).toBe(1008);
  });
});
