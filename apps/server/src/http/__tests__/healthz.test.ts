import { testsBaseUrl } from '@server/__tests__/setup';
import { describe, expect, test } from 'vite-plus/test';

describe('/healthz', () => {
  test('should return 200 status', async () => {
    const response = await fetch(`${testsBaseUrl}/healthz`);

    expect(response.status).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('status', 'ok');
    expect(data).toHaveProperty('timestamp');
  });
});
