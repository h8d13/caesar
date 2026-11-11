import { getMockedToken } from '@server/__tests__/helpers';
import type { TPublicFetchDeps } from '@server/helpers/public-fetch';
import fs from 'fs';
import http from 'http';
import type { AddressInfo } from 'net';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vite-plus/test';
import { createImageProxyHandler } from '../image-proxy';

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

const listen = (server: http.Server) =>
  new Promise<number>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve((server.address() as AddressInfo).port)
    )
  );

describe('/proxy/image', () => {
  let upstream: http.Server;
  let upstreamPort: number;
  let upstreamHits: string[];
  let proxy: http.Server;
  let proxyPort: number;
  let cacheDir: string;

  beforeAll(async () => {
    upstream = http.createServer((req, res) => {
      upstreamHits.push(req.url ?? '');

      if (req.url?.startsWith('/ok.png')) {
        res.writeHead(200, { 'Content-Type': 'image/png' }).end(PNG);
      } else if (req.url === '/redirect.png') {
        res.writeHead(302, { Location: '/ok.png?via=redirect' }).end();
      } else if (req.url === '/page.png') {
        res
          .writeHead(200, { 'Content-Type': 'text/html' })
          .end('<script>alert(1)</script>');
      } else if (req.url === '/vector.svg') {
        res
          .writeHead(200, { 'Content-Type': 'image/svg+xml' })
          .end('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
      } else if (req.url === '/huge.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        // never ends: only the size cap stops the read
        const filler = setInterval(
          () => res.write(Buffer.alloc(1024 * 1024)),
          1
        );
        res.on('close', () => clearInterval(filler));
      } else {
        res.writeHead(404).end();
      }
    });
    upstreamPort = await listen(upstream);

    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-proxy-test-'));

    // The upstream is on loopback, which the real guard refuses. These
    // stand in for "a public host": any name resolves to the upstream.
    const fetchDeps: TPublicFetchDeps = {
      isAllowedUrl: (url) => !url.includes('169.254.169.254'),
      resolveHost: async () => ({ address: '127.0.0.1', family: 4 })
    };
    const handler = createImageProxyHandler({ fetchDeps, cacheDir });

    proxy = http.createServer((req, res) => void handler(req, res));
    proxyPort = await listen(proxy);
  });

  afterAll(async () => {
    upstream.closeAllConnections();
    proxy.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
    await new Promise((resolve) => proxy.close(resolve));
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  const remote = (pathname: string) =>
    `http://images.test:${upstreamPort}${pathname}`;

  const get = async (
    url: string | undefined,
    {
      token,
      headers
    }: { token?: string; headers?: Record<string, string> } = {}
  ) => {
    upstreamHits = [];

    const query = url === undefined ? '' : `?url=${encodeURIComponent(url)}`;

    return fetch(`http://127.0.0.1:${proxyPort}/proxy/image${query}`, {
      headers: { ...(token ? { 'x-token': token } : {}), ...headers }
    });
  };

  test('requires a session', async () => {
    const res = await get(remote('/ok.png'));

    expect(res.status).toBe(401);
    expect(upstreamHits).toHaveLength(0);
  });

  test('serves the remote image from this origin', async () => {
    const token = await getMockedToken(2);
    const res = await get(remote('/ok.png?first'), { token });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
  });

  test('fetches an image once, then serves it from the cache', async () => {
    const token = await getMockedToken(2);

    await get(remote('/ok.png?cached'), { token });
    expect(upstreamHits).toHaveLength(1);

    const again = await get(remote('/ok.png?cached'), { token });

    expect(again.status).toBe(200);
    expect(upstreamHits).toHaveLength(0);

    const etag = again.headers.get('etag')!;
    const revalidated = await get(remote('/ok.png?cached'), {
      token,
      headers: { 'if-none-match': etag }
    });

    expect(revalidated.status).toBe(304);
  });

  test('follows a redirect to another image', async () => {
    const token = await getMockedToken(2);
    const res = await get(remote('/redirect.png'), { token });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });

  test('refuses anything that is not a passive image type', async () => {
    const token = await getMockedToken(2);

    // served from our own origin, an HTML or SVG body would be a script
    // host: neither is ever relayed
    expect((await get(remote('/page.png'), { token })).status).toBe(404);
    expect((await get(remote('/vector.svg'), { token })).status).toBe(404);
  });

  test('refuses an image over the size cap', async () => {
    const token = await getMockedToken(2);

    expect((await get(remote('/huge.png'), { token })).status).toBe(404);
  });

  test('does not refetch a failed image for the next viewer', async () => {
    const token = await getMockedToken(2);

    await get(remote('/missing.png'), { token });
    expect(upstreamHits).toHaveLength(1);

    expect((await get(remote('/missing.png'), { token })).status).toBe(404);
    expect(upstreamHits).toHaveLength(0);
  });

  test('rejects a missing, disallowed or non-http url', async () => {
    const token = await getMockedToken(2);

    expect((await get(undefined, { token })).status).toBe(400);
    expect((await get('http://169.254.169.254/latest', { token })).status).toBe(
      400
    );
    expect(upstreamHits).toHaveLength(0);
  });
});
