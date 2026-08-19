import { testsBaseUrl } from '@server/__tests__/setup';
import { INTERFACE_PATH } from '@server/helpers/paths';
import fs from 'fs';
import path from 'path';
import { beforeAll, describe, expect, test } from 'vitest';
import zlib from 'zlib';

describe('/interface', () => {
  const testInterfacePath = INTERFACE_PATH;

  // create a simple mock interface structure for testing
  beforeAll(() => {
    if (!fs.existsSync(testInterfacePath)) {
      fs.mkdirSync(testInterfacePath, { recursive: true });
    }

    const assetsDir = path.join(testInterfacePath, 'assets');

    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    const testJsPath = path.join(assetsDir, 'test.js');

    if (!fs.existsSync(testJsPath)) {
      fs.writeFileSync(testJsPath, 'console.log("test");');
    }

    const testCssPath = path.join(assetsDir, 'test.css');

    if (!fs.existsSync(testCssPath)) {
      fs.writeFileSync(testCssPath, 'body { margin: 0; }');
    }

    const fileWithSpaces = path.join(
      testInterfacePath,
      'test file with spaces.html'
    );

    if (!fs.existsSync(fileWithSpaces)) {
      fs.writeFileSync(fileWithSpaces, '<html><body>Spaces Test</body></html>');
    }

    const nestedDir = path.join(testInterfacePath, 'nested', 'deep');

    if (!fs.existsSync(nestedDir)) {
      fs.mkdirSync(nestedDir, { recursive: true });
    }

    const nestedFile = path.join(nestedDir, 'nested.txt');

    if (!fs.existsSync(nestedFile)) {
      fs.writeFileSync(nestedFile, 'nested content');
    }

    const noExtFile = path.join(testInterfacePath, 'CHANGELOG');

    if (!fs.existsSync(noExtFile)) {
      fs.writeFileSync(noExtFile, 'Version 1.0.0');
    }

    // Stands in for the build-time output of the client precompress plugin.
    // Body differs from the source so a test can prove which one was served.
    const precompressedSource = path.join(assetsDir, 'precompressed.js');

    if (!fs.existsSync(precompressedSource)) {
      fs.writeFileSync(precompressedSource, 'console.log("runtime");');
      fs.writeFileSync(
        `${precompressedSource}.br`,
        zlib.brotliCompressSync(Buffer.from('console.log("prebuilt br");'))
      );
      fs.writeFileSync(
        `${precompressedSource}.gz`,
        zlib.gzipSync(Buffer.from('console.log("prebuilt gz");'))
      );
    }

    const testDir = path.join(testInterfacePath, 'testdir');

    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const indexPath = path.join(testInterfacePath, 'index.html');

    if (!fs.existsSync(indexPath)) {
      fs.writeFileSync(
        indexPath,
        `<!DOCTYPE html>
<html>
<head>
  <title>Test</title>
  <link rel="stylesheet" href="/assets/test.css">
</head>
<body>
  <h1>Test Interface</h1>
  <script type="module" src="/assets/test.js"></script>
</body>
</html>`
      );
    }
  });

  test('should serve index.html when requesting root path', async () => {
    const response = await fetch(`${testsBaseUrl}/`);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');

    const text = await response.text();

    expect(text).toContain('Test Interface');
  });

  test('should serve index.html when explicitly requested', async () => {
    const response = await fetch(`${testsBaseUrl}/index.html`);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');

    const text = await response.text();

    expect(text).toContain('Test Interface');
  });

  test('should serve JavaScript files with correct content type', async () => {
    const response = await fetch(`${testsBaseUrl}/assets/test.js`);

    expect(response.status).toBe(200);

    const contentType = response.headers.get('Content-Type');

    expect(
      contentType?.includes('javascript') || contentType?.includes('text/plain')
    ).toBe(true);

    const text = await response.text();

    expect(text).toContain('console.log');
  });

  test('should serve CSS files with correct content type', async () => {
    const response = await fetch(`${testsBaseUrl}/assets/test.css`);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/css');

    const text = await response.text();

    expect(text).toContain('body');
  });

  test('should return 404 for non-existent files', async () => {
    const response = await fetch(`${testsBaseUrl}/non-existent-file.html`);

    expect(response.status).toBe(404);

    const data = await response.json();

    expect(data).toHaveProperty('error', 'Not found');
  });

  test('should return 404 for non-existent paths', async () => {
    const response = await fetch(`${testsBaseUrl}/fake/path/file.js`);

    expect(response.status).toBe(404);

    const data = await response.json();

    expect(data).toHaveProperty('error', 'Not found');
  });

  test('should prevent path traversal attacks', async () => {
    const response = await fetch(`${testsBaseUrl}/../../../etc/passwd`);

    expect([403, 404]).toContain(response.status);

    const data = await response.json();

    expect(data).toHaveProperty('error');
  });

  test('should prevent encoded path traversal attacks', async () => {
    const response = await fetch(
      `${testsBaseUrl}/${encodeURIComponent('../../../etc/passwd')}`
    );

    expect(response.status).toBe(403);

    const data = await response.json();

    expect(data).toHaveProperty('error', 'Forbidden');
  });

  test('should handle URL decoding correctly', async () => {
    const encodedFileName = encodeURIComponent('test file with spaces.html');
    const response = await fetch(`${testsBaseUrl}/${encodedFileName}`);

    expect(response.status).toBe(200);

    const text = await response.text();

    expect(text).toContain('Spaces Test');
  });

  test('should handle query parameters in URLs', async () => {
    const response = await fetch(
      `${testsBaseUrl}/index.html?v=123&cache=false`
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');

    const text = await response.text();

    expect(text).toContain('Test Interface');
  });

  test('should serve nested directory files', async () => {
    const response = await fetch(`${testsBaseUrl}/nested/deep/nested.txt`);

    expect(response.status).toBe(200);

    const text = await response.text();

    expect(text).toBe('nested content');
  });

  test('should handle files without extensions', async () => {
    const response = await fetch(`${testsBaseUrl}/CHANGELOG`);

    expect(response.status).toBe(200);

    const text = await response.text();

    expect(text).toBe('Version 1.0.0');
  });

  test('should set correct Content-Length header for non-compressed files', async () => {
    const response = await fetch(`${testsBaseUrl}/CHANGELOG`);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Length')).toBeTruthy();

    const contentLength = parseInt(
      response.headers.get('Content-Length') || '0'
    );

    const text = await response.text();

    expect(contentLength).toBe(text.length);
  });

  test('should handle empty URL path as root', async () => {
    const response = await fetch(`${testsBaseUrl}/`);

    expect(response.status).toBe(200);

    const text = await response.text();

    expect(text).toContain('Test Interface');
  });

  test('should reject paths with null bytes', async () => {
    const response = await fetch(`${testsBaseUrl}/test%00.html`);

    expect([403, 404]).toContain(response.status);
  });

  test('should serve the precompressed sibling when the client accepts br', async () => {
    const response = await fetch(`${testsBaseUrl}/assets/precompressed.js`, {
      headers: { 'Accept-Encoding': 'br' }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Encoding')).toBe('br');
    // Content-Length is only knowable because the file is precompressed;
    // the runtime-compression path streams chunked.
    expect(response.headers.get('Content-Length')).toBeTruthy();
    expect(response.headers.get('Vary')).toBe('Accept-Encoding');

    expect(await response.text()).toBe('console.log("prebuilt br");');
  });

  test('should serve the gzip sibling when br is not accepted', async () => {
    const response = await fetch(`${testsBaseUrl}/assets/precompressed.js`, {
      headers: { 'Accept-Encoding': 'gzip' }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Encoding')).toBe('gzip');

    expect(await response.text()).toBe('console.log("prebuilt gz");');
  });

  test('should compress at runtime when no sibling exists', async () => {
    const response = await fetch(`${testsBaseUrl}/assets/test.js`, {
      headers: { 'Accept-Encoding': 'br' }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Encoding')).toBe('br');

    expect(await response.text()).toContain('console.log');
  });

  test('should serve the source file when no encoding is accepted', async () => {
    const response = await fetch(`${testsBaseUrl}/assets/precompressed.js`, {
      headers: { 'Accept-Encoding': 'identity' }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Encoding')).toBeNull();

    expect(await response.text()).toBe('console.log("runtime");');
  });

  test('should give each encoding a distinct ETag', async () => {
    const encodings = ['br', 'gzip', 'identity'];
    const etags = await Promise.all(
      encodings.map(async (encoding) => {
        const response = await fetch(
          `${testsBaseUrl}/assets/precompressed.js`,
          { headers: { 'Accept-Encoding': encoding } }
        );

        return response.headers.get('ETag');
      })
    );

    for (const etag of etags) {
      expect(etag).toBeTruthy();
    }

    // Same source file, three different byte streams: a shared ETag would let
    // a cache that ignores Vary hand a br body to an identity client.
    expect(new Set(etags).size).toBe(encodings.length);
  });

  test('should return 304 for a matching encoding-specific ETag', async () => {
    const first = await fetch(`${testsBaseUrl}/assets/precompressed.js`, {
      headers: { 'Accept-Encoding': 'br' }
    });

    const etag = first.headers.get('ETag');

    expect(etag).toBeTruthy();

    const second = await fetch(`${testsBaseUrl}/assets/precompressed.js`, {
      headers: { 'Accept-Encoding': 'br', 'If-None-Match': etag as string }
    });

    expect(second.status).toBe(304);
    expect(second.headers.get('Vary')).toBe('Accept-Encoding');
  });

  test('should handle trailing slashes correctly', async () => {
    const response = await fetch(`${testsBaseUrl}/testdir/`);

    expect(response.status).toBe(404);
  });
});
