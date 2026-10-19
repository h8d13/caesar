import type http from 'http';
import { describe, expect, test } from 'vite-plus/test';
import { getSessionToken, isCrossOrigin } from '../session-token';

const req = (headers: http.IncomingHttpHeaders) =>
  ({ headers }) as http.IncomingMessage;

describe('isCrossOrigin', () => {
  test('no Origin header is not cross-origin', () => {
    expect(isCrossOrigin(req({ host: 'chat.example.com' }))).toBe(false);
  });

  test('same host is not cross-origin', () => {
    expect(
      isCrossOrigin(
        req({ host: 'chat.example.com', origin: 'https://chat.example.com' })
      )
    ).toBe(false);
  });

  test('ports are ignored (dev page on :5173, socket on :4991)', () => {
    expect(
      isCrossOrigin(
        req({ host: 'localhost:4991', origin: 'http://localhost:5173' })
      )
    ).toBe(false);
  });

  test('another host is cross-origin, sibling subdomains included', () => {
    expect(
      isCrossOrigin(
        req({ host: 'chat.example.com', origin: 'https://evil.example' })
      )
    ).toBe(true);
    expect(
      isCrossOrigin(
        req({ host: 'chat.example.com', origin: 'https://x.example.com' })
      )
    ).toBe(true);
  });

  test('an unparseable Origin is cross-origin', () => {
    expect(isCrossOrigin(req({ host: 'a.com', origin: 'null' }))).toBe(true);
  });
});

describe('getSessionToken', () => {
  test('reads the session cookie', () => {
    expect(
      getSessionToken(req({ host: 'a.com', cookie: 'x=1; caesar-session=t1' }))
    ).toBe('t1');
  });

  test('ignores the cookie on a cross-origin request', () => {
    expect(
      getSessionToken(
        req({
          host: 'a.com',
          origin: 'https://evil.example',
          cookie: 'caesar-session=t1'
        })
      )
    ).toBeUndefined();
  });

  test('falls back to the x-token header', () => {
    expect(getSessionToken(req({ host: 'a.com', 'x-token': 't2' }))).toBe('t2');
  });

  test('does not read the legacy cookie name', () => {
    expect(
      getSessionToken(req({ host: 'a.com', cookie: 'caesar-token=old' }))
    ).toBeUndefined();
  });
});
