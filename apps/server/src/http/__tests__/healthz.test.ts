import { testsBaseUrl } from '@server/__tests__/setup';
import { describe, expect, test } from 'vite-plus/test';
import { createHttpServer } from '..';

describe('/healthz', () => {
  test('should return 200 status', async () => {
    const response = await fetch(`${testsBaseUrl}/healthz`);

    expect(response.status).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('status', 'ok');
    expect(data).toHaveProperty('timestamp');
  });
});

describe('http server timeouts', () => {
  test('outlive the reverse proxy idle keep-alive', async () => {
    const server = await createHttpServer(0);

    // Caddy keeps idle upstream connections for 2m. If Node closes first,
    // a request racing the close (a POST cannot be retried) gets a 502.
    expect(server.keepAliveTimeout).toBeGreaterThan(120_000);

    await new Promise((resolve) => server.close(resolve));
  });
});
