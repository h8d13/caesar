import type { TPublicFetchDeps } from '@server/helpers/public-fetch';
import http from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, test } from 'vite-plus/test';
import { fetchLinkPreview, parsePreview } from '../fetch-preview';

describe('parsePreview', () => {
  test('reads open graph tags, falling back to <title> and description', () => {
    const preview = parsePreview(
      `<html><head>
        <title>Plain title</title>
        <meta property="og:title" content="OG &amp; title">
        <meta name="description" content="  A   description ">
        <meta property="og:site_name" content='Site'>
        <meta property="og:image" content="/img/a.png">
        <link rel="shortcut icon" href="fav.ico">
      </head><body><meta property="og:title" content="body"></body></html>`,
      'https://example.com/post/1'
    );

    expect(preview.title).toBe('OG & title');
    expect(preview.description).toBe('A description');
    expect(preview.siteName).toBe('Site');
    expect(preview.images).toEqual(['https://example.com/img/a.png']);
    expect(preview.favicons).toEqual(['https://example.com/post/fav.ico']);
    expect(preview.mediaType).toBe('website');
  });

  test('uses <title> when there is no og:title and /favicon.ico by default', () => {
    const preview = parsePreview(
      '<head><title>Only &#39;title&#39;</title></head>',
      'https://example.com/x'
    );

    expect(preview.title).toBe("Only 'title'");
    expect(preview.favicons).toEqual(['https://example.com/favicon.ico']);
  });

  test('drops image and icon URLs that are not http(s)', () => {
    const preview = parsePreview(
      `<head><title>t</title>
        <meta property="og:image" content="javascript:alert(1)">
        <meta property="og:image" content="data:image/png;base64,AAAA">
        <link rel="icon" href="file:///etc/passwd">
      </head>`,
      'https://example.com/'
    );

    expect(preview.images).toEqual([]);
    expect(preview.favicons).toEqual(['https://example.com/favicon.ico']);
  });

  test('caps text length and the number of images', () => {
    const images = Array.from(
      { length: 10 },
      (_, i) => `<meta property="og:image" content="https://e.com/${i}.png">`
    ).join('');
    const preview = parsePreview(
      `<head><title>${'t'.repeat(5000)}</title>${images}</head>`,
      'https://example.com/'
    );

    expect(preview.title).toHaveLength(300);
    expect(preview.images).toHaveLength(3);
  });
});

describe('fetchLinkPreview', () => {
  let server: http.Server;
  let port: number;
  let requests: string[];

  const page = '<head><title>Hello</title></head>';

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      requests.push(`${req.headers.host}${req.url}`);

      if (req.url === '/redirect') {
        res.writeHead(302, { Location: '/page' }).end();
      } else if (req.url === '/to-internal') {
        res.writeHead(302, { Location: 'http://169.254.169.254/latest' }).end();
      } else if (req.url === '/loop') {
        res.writeHead(302, { Location: '/loop' }).end();
      } else if (req.url === '/image') {
        res.writeHead(200, { 'Content-Type': 'image/png' }).end('png');
      } else if (req.url === '/huge') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.write(page);
        // never ends: only the size cap or the deadline stops the read
        const filler = setInterval(() => res.write('x'.repeat(64 * 1024)), 1);
        res.on('close', () => clearInterval(filler));
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page);
      }
    });

    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    );
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  // The test server is on loopback, which the real guard refuses. These
  // deps stand in for "a public host": any name resolves to the test
  // server, the literal metadata address stays refused.
  const deps = (): TPublicFetchDeps => {
    requests = [];

    return {
      isAllowedUrl: (url) => !url.includes('169.254.169.254'),
      resolveHost: async () => ({ address: '127.0.0.1', family: 4 })
    };
  };

  const at = (path: string) => `http://preview.test:${port}${path}`;

  test('returns the preview of an HTML page', async () => {
    const preview = await fetchLinkPreview(at('/page'), deps());

    expect(preview?.title).toBe('Hello');
    expect(preview?.url).toBe(at('/page'));
  });

  test('connects to the address that was checked, not to what the name resolves to later', async () => {
    // preview.test does not exist: the request can only have reached the
    // test server through the pinned lookup
    await fetchLinkPreview(at('/page'), deps());

    expect(requests).toEqual([`preview.test:${port}/page`]);
  });

  test('follows a redirect and keeps the original url on the preview', async () => {
    const preview = await fetchLinkPreview(at('/redirect'), deps());

    expect(preview?.title).toBe('Hello');
    expect(preview?.url).toBe(at('/redirect'));
  });

  test('refuses a redirect to a disallowed address', async () => {
    expect(await fetchLinkPreview(at('/to-internal'), deps())).toBeUndefined();
    expect(requests).toHaveLength(1);
  });

  test('gives up on a redirect loop', async () => {
    expect(await fetchLinkPreview(at('/loop'), deps())).toBeUndefined();
    expect(requests).toHaveLength(4);
  });

  test('does not read a body that is not HTML', async () => {
    expect(await fetchLinkPreview(at('/image'), deps())).toBeUndefined();
  });

  test('stops reading an endless body at the size cap', async () => {
    const preview = await fetchLinkPreview(at('/huge'), deps());

    expect(preview?.title).toBe('Hello');
  });

  test('with the real guard, a loopback URL is never requested', async () => {
    requests = [];

    expect(
      await fetchLinkPreview(`http://127.0.0.1:${port}/page`)
    ).toBeUndefined();
    await expect(
      fetchLinkPreview(`http://localhost:${port}/page`)
    ).rejects.toThrow('Cannot resolve private IP addresses');
    expect(requests).toHaveLength(0);
  });
});
