import type { TServerInfo } from '@caesar/shared';
import { testsBaseUrl } from '@server/__tests__/setup';
import { describe, expect, test } from 'vitest';

describe('/info', () => {
  test('should return server info', async () => {
    const response = await fetch(`${testsBaseUrl}/info`);

    expect(response.status).toBe(200);

    const data = (await response.json()) as TServerInfo;

    expect(data).toHaveProperty('serverId');
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('name');
    expect(data).toHaveProperty('description');
    expect(data).toHaveProperty('logo');

    expect(data.name).toBe('Test Server');
    expect(data.description).toBe('Test server description');
  });
});
