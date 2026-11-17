import { testsBaseUrl } from '@server/__tests__/setup';
import { logger } from '@server/logger';
import net from 'net';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

// How the router turns bad client input into a response. None of these are
// server faults, so none may surface as a 500.

const post = (path: string, body: string) =>
  fetch(`${testsBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });

type TErrorBody = { error?: string; errors: Record<string, string> };

const JSON_BODY_ROUTES = ['/login', '/login/2fa', '/session/refresh'];

describe('http error mapping', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('malformed JSON', () => {
    test.each(JSON_BODY_ROUTES)('%s answers 400', async (route) => {
      const response = await post(route, '{bad');

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Malformed JSON body' });
    });

    test.each([
      ['truncated object', '{"identity":"a"'],
      ['trailing comma', '{"identity":"a",}'],
      ['single quotes', "{'identity':'a'}"],
      ['whitespace only', '   '],
      ['byte order mark', '﻿{}'],
      ['plain text', 'identity=a&authKey=b']
    ])('%s answers 400', async (_name, body) => {
      const response = await post('/login', body);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Malformed JSON body' });
    });

    test('is not logged as a server error', async () => {
      const errorSpy = vi.spyOn(logger, 'error');

      await post('/login', '{bad');

      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('valid JSON of the wrong shape', () => {
    test.each([
      ['null', 'null'],
      ['array', '[]'],
      ['string', '"x"'],
      ['number', '42'],
      ['boolean', 'true']
    ])('%s at the root answers 400 with a message', async (_name, body) => {
      for (const route of JSON_BODY_ROUTES) {
        const response = await post(route, body);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
          error: 'Invalid request body',
          errors: {}
        });
      }
    });

    test('field errors keep the per-field shape, without a top-level error', async () => {
      const response = await post('/login', '{"identity":5,"authKey":5}');
      const data = (await response.json()) as TErrorBody;

      expect(response.status).toBe(400);
      expect(data.error).toBeUndefined();
      expect(Object.keys(data.errors).sort()).toEqual(['authKey', 'identity']);
    });

    test('an empty body gets per-field errors', async () => {
      const response = await post('/login', '');
      const data = (await response.json()) as TErrorBody;

      expect(response.status).toBe(400);
      expect(data.error).toBeUndefined();
      expect(data.errors).toHaveProperty('identity');
    });
  });

  test('a body over the cap answers 413', async () => {
    const response = await post(
      '/login',
      JSON.stringify({ identity: 'x'.repeat(1024 * 1024) })
    );

    expect(response.status).toBe(413);
  });

  test('a client that aborts mid-body is not logged as a server error', async () => {
    const errorSpy = vi.spyOn(logger, 'error');
    const { hostname, port } = new URL(testsBaseUrl);

    await new Promise<void>((resolve, reject) => {
      const socket = net.connect(Number(port), hostname, () => {
        // promises 100 bytes, sends 10, then drops the connection
        socket.write(
          'POST /login HTTP/1.1\r\n' +
            `Host: ${hostname}:${port}\r\n` +
            'Content-Type: application/json\r\n' +
            'Content-Length: 100\r\n' +
            '\r\n' +
            '{"identit',
          () => {
            socket.destroy();
            resolve();
          }
        );
      });

      socket.on('error', reject);
    });

    // the server sees the reset on a later tick; a follow-up request both
    // waits for that and proves the server is still answering
    await new Promise((resolve) => setTimeout(resolve, 100));

    const response = await post('/login', '{bad');

    expect(response.status).toBe(400);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
