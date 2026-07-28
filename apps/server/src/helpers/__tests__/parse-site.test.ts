import { describe, expect, test } from 'vitest';
import { parseSite } from '../parse-site';

describe('parseSite', () => {
  test('bare localhost is the http vite dev surface', () => {
    expect(parseSite('localhost')).toEqual({
      host: 'localhost',
      scheme: 'http',
      origin: 'http://localhost'
    });
  });

  test('localhost:8443 is the prod-dev https surface', () => {
    expect(parseSite('localhost:8443')).toEqual({
      host: 'localhost',
      scheme: 'https',
      origin: 'https://localhost:8443'
    });
  });

  test('a domain assumes https and keeps the port out of the RP ID', () => {
    expect(parseSite('sub.example.com')).toEqual({
      host: 'sub.example.com',
      scheme: 'https',
      origin: 'https://sub.example.com'
    });
    expect(parseSite('sub.example.com:8443').host).toBe('sub.example.com');
  });

  test('unset or blank falls back to localhost', () => {
    expect(parseSite(undefined).host).toBe('localhost');
    expect(parseSite('   ').origin).toBe('http://localhost');
  });

  // Caddy accepts both forms as one site block; the server must not.
  test.each(['example.com www.example.com', 'example.com, www.example.com'])(
    'rejects multi-host value %j',
    (value) => {
      expect(() => parseSite(value)).toThrow(/single host/);
    }
  );
});
