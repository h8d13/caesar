import { login } from '@server/__tests__/helpers';
import { testsBaseUrl } from '@server/__tests__/setup';
import { describe, expect, test } from 'vitest';

describe('/logout', () => {
  test('returns 200 with clearing cookie when token is valid', async () => {
    const loginRes = await login('testowner', 'password123');
    const { token } = (await loginRes.json()) as { token: string };

    const res = await fetch(`${testsBaseUrl}/logout`, {
      method: 'POST',
      headers: { 'x-token': token }
    });

    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('caesar-token=');
    expect(setCookie).toContain('Max-Age=0');
  });

  test('returns 200 even without a token (idempotent)', async () => {
    const res = await fetch(`${testsBaseUrl}/logout`, { method: 'POST' });
    expect(res.status).toBe(200);
  });

  test('returns 200 with an invalid/expired token', async () => {
    const res = await fetch(`${testsBaseUrl}/logout`, {
      method: 'POST',
      headers: { 'x-token': 'not-a-real-token' }
    });
    expect(res.status).toBe(200);
  });
});
