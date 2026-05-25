import type http from 'http';
import { describe, expect, test } from 'vitest';
import { getWsInfo, resolveClientIp } from '../get-ws-info';

const createRequest = ({
  headers = {},
  remoteAddress
}: {
  headers?: http.IncomingHttpHeaders;
  remoteAddress?: string;
} = {}) => {
  return {
    headers,
    socket: { remoteAddress },
    connection: { remoteAddress }
  } as unknown as http.IncomingMessage;
};

// Default env wiring is TRUSTED_PROXY_HOPS=1, no CDN header (matches the
// bundled single-Caddy deployment).
const ipOf = (ws: any, req: http.IncomingMessage): string | undefined =>
  getWsInfo(ws, req)?.ip;

const DIRECT = { trustedProxyHops: 0, trustedClientIpHeader: '' };
const ONE_HOP = { trustedProxyHops: 1, trustedClientIpHeader: '' };
const TWO_HOPS = { trustedProxyHops: 2, trustedClientIpHeader: '' };
const CLOUDFLARE = {
  trustedProxyHops: 1,
  trustedClientIpHeader: 'cf-connecting-ip'
};

describe('resolveClientIp - trust policy', () => {
  describe('direct exposure (hops=0)', () => {
    test('uses the socket peer and ignores all forwarding headers', () => {
      const ip = resolveClientIp(
        {
          'x-forwarded-for': '9.9.9.9',
          'cf-connecting-ip': '8.8.8.8',
          'x-real-ip': '7.7.7.7'
        },
        ['198.51.100.33'],
        DIRECT
      );

      expect(ip).toBe('198.51.100.33');
    });

    test('returns undefined when there is no socket peer', () => {
      expect(
        resolveClientIp({ 'x-forwarded-for': '9.9.9.9' }, [], DIRECT)
      ).toBeUndefined();
    });
  });

  describe('single trusted proxy (hops=1)', () => {
    test('uses the rightmost x-forwarded-for entry (the one the proxy added)', () => {
      const ip = resolveClientIp(
        { 'x-forwarded-for': '203.0.113.7' },
        ['172.19.0.2'],
        ONE_HOP
      );

      expect(ip).toBe('203.0.113.7');
    });

    test('ignores spoofed entries prepended by the client', () => {
      // Attacker sends "9.9.9.9"; the trusted proxy appends the real peer to
      // the right. Only the rightmost (proxy-added) entry is trusted.
      const ip = resolveClientIp(
        { 'x-forwarded-for': '9.9.9.9, 203.0.113.7' },
        ['172.19.0.2'],
        ONE_HOP
      );

      expect(ip).toBe('203.0.113.7');
    });

    test('more entries than the cap cannot push out the trusted suffix', () => {
      // 60 short entries (> MAX_IP_CANDIDATES of 50) but small enough to stay
      // under the 2048-char header guard. The chain is capped from the RIGHT,
      // so the proxy-added rightmost entry always survives.
      const spoofed = Array.from({ length: 60 }, () => '1.1.1.1');
      const ip = resolveClientIp(
        { 'x-forwarded-for': `${spoofed.join(', ')}, 203.0.113.7` },
        ['172.19.0.2'],
        ONE_HOP
      );

      expect(ip).toBe('203.0.113.7');
    });

    test('ignores spoofable CDN / real-ip headers entirely', () => {
      const ip = resolveClientIp(
        {
          'cf-connecting-ip': '8.8.8.8',
          'x-real-ip': '7.7.7.7',
          'true-client-ip': '6.6.6.6'
        },
        ['203.0.113.7'],
        ONE_HOP
      );

      // None of the CDN headers are trusted; XFF is absent -> socket peer.
      expect(ip).toBe('203.0.113.7');
    });

    test('falls back to socket peer when x-forwarded-for is absent', () => {
      const ip = resolveClientIp({}, ['203.0.113.7'], ONE_HOP);

      expect(ip).toBe('203.0.113.7');
    });

    test('falls back to socket peer when x-forwarded-for is garbage', () => {
      const ip = resolveClientIp(
        { 'x-forwarded-for': 'not-an-ip' },
        ['203.0.113.7'],
        ONE_HOP
      );

      expect(ip).toBe('203.0.113.7');
    });
  });

  describe('two trusted proxies (hops=2)', () => {
    test('uses the second entry from the right', () => {
      const ip = resolveClientIp(
        { 'x-forwarded-for': '203.0.113.7, 10.0.0.2' },
        ['172.19.0.2'],
        TWO_HOPS
      );

      expect(ip).toBe('203.0.113.7');
    });

    test('spoofed prefix is still ignored', () => {
      const ip = resolveClientIp(
        { 'x-forwarded-for': '9.9.9.9, 203.0.113.7, 10.0.0.2' },
        ['172.19.0.2'],
        TWO_HOPS
      );

      expect(ip).toBe('203.0.113.7');
    });

    test('falls back to socket when the chain is shorter than the hop count', () => {
      const ip = resolveClientIp(
        { 'x-forwarded-for': '203.0.113.7' },
        ['172.19.0.2'],
        TWO_HOPS
      );

      expect(ip).toBe('172.19.0.2');
    });
  });

  describe('CDN single-value header', () => {
    test('uses the configured header and ignores x-forwarded-for', () => {
      const ip = resolveClientIp(
        {
          'cf-connecting-ip': '203.0.113.50',
          'x-forwarded-for': '9.9.9.9, 10.0.0.2'
        },
        ['172.19.0.2'],
        CLOUDFLARE
      );

      expect(ip).toBe('203.0.113.50');
    });

    test('falls back to socket (not XFF) when the configured header is missing', () => {
      const ip = resolveClientIp(
        { 'x-forwarded-for': '9.9.9.9' },
        ['172.19.0.2'],
        CLOUDFLARE
      );

      expect(ip).toBe('172.19.0.2');
    });
  });

  describe('normalization', () => {
    test('normalizes IPv4-mapped IPv6 from the socket peer', () => {
      expect(resolveClientIp({}, ['::ffff:127.0.0.1'], ONE_HOP)).toBe(
        '127.0.0.1'
      );
    });

    test('normalizes IPv4-mapped IPv6 from x-forwarded-for', () => {
      expect(
        resolveClientIp(
          { 'x-forwarded-for': '::ffff:93.184.216.34' },
          ['172.19.0.2'],
          ONE_HOP
        )
      ).toBe('93.184.216.34');
    });

    test('strips port from an IPv4 x-forwarded-for entry', () => {
      expect(
        resolveClientIp(
          { 'x-forwarded-for': '198.51.100.5:8080' },
          ['172.19.0.2'],
          ONE_HOP
        )
      ).toBe('198.51.100.5');
    });

    test('preserves a valid plain IPv6 address', () => {
      expect(
        resolveClientIp(
          { 'cf-connecting-ip': '2001:db8::1' },
          ['172.19.0.2'],
          CLOUDFLARE
        )
      ).toBe('2001:db8::1');
    });
  });

  describe('robustness', () => {
    test('discards an oversized x-forwarded-for header (DoS protection)', () => {
      const hugeValue = '198.51.100.1, '.repeat(500);
      expect(
        resolveClientIp(
          { 'x-forwarded-for': hugeValue },
          ['127.0.0.1'],
          ONE_HOP
        )
      ).toBe('127.0.0.1');
    });

    test('prefers ws._socket over later socket candidates', () => {
      expect(
        resolveClientIp({}, ['198.51.100.1', '198.51.100.2'], ONE_HOP)
      ).toBe('198.51.100.1');
    });

    test('skips an invalid leading socket candidate', () => {
      expect(
        resolveClientIp({}, [undefined, 'garbage', '198.51.100.2'], ONE_HOP)
      ).toBe('198.51.100.2');
    });
  });
});

describe('getWsInfo - default env wiring (single trusted proxy)', () => {
  test('uses the rightmost x-forwarded-for entry', () => {
    const req = createRequest({
      headers: { 'x-forwarded-for': '9.9.9.9, 203.0.113.7' },
      remoteAddress: '172.19.0.2'
    });

    expect(ipOf(undefined, req)).toBe('203.0.113.7');
  });

  test('ignores spoofable cf-connecting-ip by default', () => {
    const req = createRequest({
      headers: { 'cf-connecting-ip': '8.8.8.8' },
      remoteAddress: '203.0.113.7'
    });

    expect(ipOf(undefined, req)).toBe('203.0.113.7');
  });

  test('falls back to the request socket when no forwarding header is present', () => {
    const req = createRequest({ remoteAddress: '198.51.100.33' });

    expect(ipOf(undefined, req)).toBe('198.51.100.33');
  });

  test('reads the websocket socket when no req socket is available', () => {
    const req = createRequest({});
    const ws = { _socket: { remoteAddress: '198.51.100.99' } };

    expect(ipOf(ws, req)).toBe('198.51.100.99');
  });

  test('normalizes IPv4-mapped IPv6 from the websocket socket', () => {
    const req = createRequest({});
    const ws = { _socket: { remoteAddress: '::ffff:127.0.0.1' } };

    expect(ipOf(ws, req)).toBe('127.0.0.1');
  });
});

describe('getWsInfo - robustness', () => {
  test('returns undefined when no info is available at all', () => {
    expect(getWsInfo(undefined, createRequest({}))).toBeUndefined();
  });

  test('returns undefined when both ws and req are undefined', () => {
    expect(getWsInfo(undefined, undefined)).toBeUndefined();
  });

  test('handles completely empty headers object', () => {
    expect(
      getWsInfo(undefined, createRequest({ headers: {} }))
    ).toBeUndefined();
  });
});

describe('getWsInfo - user-agent parsing', () => {
  test('parses OS name and version from user-agent', () => {
    const req = createRequest({
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      remoteAddress: '127.0.0.1'
    });

    expect(getWsInfo(undefined, req)?.os).toBe('Windows 10');
  });

  test('sets device to Desktop for non-mobile user-agents', () => {
    const req = createRequest({
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      remoteAddress: '127.0.0.1'
    });

    expect(getWsInfo(undefined, req)?.device).toBe('Desktop');
  });

  test('parses mobile device info', () => {
    const req = createRequest({
      headers: {
        'user-agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
      },
      remoteAddress: '127.0.0.1'
    });

    const result = getWsInfo(undefined, req);

    expect(result?.os).toBe('iOS 16.0');
    expect(result?.device).toBe('Apple iPhone');
  });

  test('returns ip even when user-agent is missing', () => {
    const req = createRequest({ remoteAddress: '198.51.100.1' });
    const result = getWsInfo(undefined, req);

    expect(result?.ip).toBe('198.51.100.1');
    expect(result?.userAgent).toBeUndefined();
  });

  test('returns user-agent info even when ip is unavailable', () => {
    const req = createRequest({
      headers: {
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
      }
    });
    const result = getWsInfo(undefined, req);

    expect(result?.ip).toBeUndefined();
    expect(result?.os).toBe('Linux');
  });
});

describe('getWsInfo - return value', () => {
  test('result shape has only expected keys', () => {
    const req = createRequest({
      headers: { 'user-agent': 'TestBot/1.0' },
      remoteAddress: '203.0.113.1'
    });

    const keys = Object.keys(getWsInfo(undefined, req)!).sort();

    expect(keys).toEqual(['device', 'ip', 'os', 'userAgent']);
  });
});
