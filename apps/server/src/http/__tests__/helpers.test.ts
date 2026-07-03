import { EventEmitter } from 'events';
import type http from 'http';
import { describe, expect, test } from 'vitest';
import {
  getJsonBody,
  getRequestPathname,
  hasPrefixPathSegment
} from '../helpers';
import { PayloadTooLargeError } from '../utils';

const createMockRequest = (
  url?: string,
  host?: string
): EventEmitter & http.IncomingMessage => {
  const req = new EventEmitter() as EventEmitter & http.IncomingMessage;

  req.url = url;
  req.headers = { host };

  return req;
};

describe('http helpers', () => {
  describe('hasPrefixPathSegment', () => {
    test('matches exact path and path segment prefixes', () => {
      expect(hasPrefixPathSegment('/public', '/public')).toBe(true);
      expect(hasPrefixPathSegment('/public/file.txt', '/public')).toBe(true);
      expect(hasPrefixPathSegment('/uploads/a/b.js', '/uploads')).toBe(true);
    });

    test('does not match lookalike prefixes', () => {
      expect(hasPrefixPathSegment('/publicx', '/public')).toBe(false);
      expect(hasPrefixPathSegment('/publicx-extra', '/publicx')).toBe(false);
    });
  });

  describe('getRequestPathname', () => {
    test('returns pathname and ignores query params', () => {
      const req = createMockRequest(
        '/public/images/logo.png?v=123',
        'localhost:9999'
      );

      expect(getRequestPathname(req)).toBe('/public/images/logo.png');
    });

    test('returns null when url is missing', () => {
      const req = createMockRequest(undefined, 'localhost:9999');

      expect(getRequestPathname(req)).toBeNull();
    });

    test('returns null for invalid absolute url', () => {
      const req = createMockRequest('http://[', 'localhost:9999');

      expect(getRequestPathname(req)).toBeNull();
    });
  });

  describe('getJsonBody', () => {
    test('parses valid json body', async () => {
      const req = createMockRequest('/login', 'localhost:9999');

      queueMicrotask(() => {
        req.emit('data', '{"identity":"test"}');
        req.emit('end');
      });

      const body = await getJsonBody<{ identity: string }>(req);

      expect(body.identity).toBe('test');
    });

    test('returns empty object when body is empty', async () => {
      const req = createMockRequest('/login', 'localhost:9999');

      queueMicrotask(() => {
        req.emit('end');
      });

      const body = await getJsonBody<Record<string, unknown>>(req);

      expect(body).toEqual({});
    });

    test('rejects for invalid json', async () => {
      const req = createMockRequest('/login', 'localhost:9999');

      queueMicrotask(() => {
        req.emit('data', '{invalid-json');
        req.emit('end');
      });

      await expect(getJsonBody(req)).rejects.toBeInstanceOf(Error);
    });

    test('rejects when request emits an error', async () => {
      const req = createMockRequest('/login', 'localhost:9999');

      queueMicrotask(() => {
        req.emit('error', new Error('request failed'));
      });

      await expect(getJsonBody(req)).rejects.toThrow('request failed');
    });

    test('rejects a single chunk over the max size', async () => {
      const req = createMockRequest('/login', 'localhost:9999');

      queueMicrotask(() => {
        req.emit('data', 'x'.repeat(100));
        req.emit('end');
      });

      await expect(getJsonBody(req, 50)).rejects.toBeInstanceOf(
        PayloadTooLargeError
      );
    });

    test('rejects when accumulated chunks exceed the max size', async () => {
      const req = createMockRequest('/login', 'localhost:9999');

      queueMicrotask(() => {
        req.emit('data', 'x'.repeat(30));
        req.emit('data', 'x'.repeat(30));
        req.emit('end');
      });

      await expect(getJsonBody(req, 50)).rejects.toBeInstanceOf(
        PayloadTooLargeError
      );
    });

    test('accepts a body exactly at the max size', async () => {
      const payload = JSON.stringify({ a: 'b' });
      const req = createMockRequest('/login', 'localhost:9999');

      queueMicrotask(() => {
        req.emit('data', payload);
        req.emit('end');
      });

      const body = await getJsonBody<{ a: string }>(
        req,
        Buffer.byteLength(payload)
      );

      expect(body.a).toBe('b');
    });
  });
});
