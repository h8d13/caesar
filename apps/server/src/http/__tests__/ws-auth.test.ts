import { DisconnectCode } from '@caesar/shared';
import { users } from '@caesar/shared/db/schema';
import { initTest, loginToken } from '@server/__tests__/helpers';
import { tdb } from '@server/__tests__/setup';
import { createWsServer } from '@server/utils/wss';
import { eq } from 'drizzle-orm';
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
  // a failed test can leave its socket open, which blocks server.close
  for (const client of wss.clients) client.terminate();
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

// one raw tRPC call on an already open socket, matched by id
const call = <T>(ws: WebSocket, id: number, path: string, input?: unknown) =>
  new Promise<T>((resolve, reject) => {
    const onMessage = (data: Buffer) => {
      const reply = JSON.parse(data.toString());

      if (reply.id !== id) return;

      ws.off('message', onMessage);

      if (reply.result) resolve(reply.result.data);
      else reject(new Error(JSON.stringify(reply.error)));
    };

    ws.on('message', onMessage);
    ws.send(JSON.stringify({ id, method: 'query', params: { path, input } }));
  });

describe('WebSocket close frames', () => {
  // ws throws RangeError past 123 bytes (RFC 6455 control frame limit)
  test('a ban reason longer than a close frame still bans', async () => {
    const token = await loginToken('testuser', 'password123');
    const ws = open({
      origin: `https://${host()}`,
      cookie: `caesar-session=${token}`
    });
    const closed = new Promise<number>((resolve) =>
      ws.on('close', (code) => resolve(code))
    );

    await new Promise((resolve) => ws.on('open', resolve));

    const { handshakeHash } = await call<{ handshakeHash: string }>(
      ws,
      1,
      'others.handshake'
    );
    const { ownUserId: userId } = await call<{ ownUserId: number }>(
      ws,
      2,
      'others.joinServer',
      { handshakeHash }
    );

    const { caller: owner } = await initTest(1);

    await owner.users.ban({ userId, reason: 'é'.repeat(200) });

    const row = await tdb
      .select({ banned: users.banned, banReason: users.banReason })
      .from(users)
      .where(eq(users.id, userId))
      .get();

    expect(row?.banned).toBe(true);
    expect(row?.banReason).toBe('é'.repeat(200));
    expect(await closed).toBe(DisconnectCode.BANNED);
  });
});
