import { describe, expect, test } from 'vite-plus/test';
import { buildListenInfos } from '../mediasoup';

describe('buildListenInfos', () => {
  test('is IPv4 only without an IPv6 announced address', () => {
    const { listenInfos } = buildListenInfos(40000, '203.0.113.7');

    expect(listenInfos).toEqual([
      {
        protocol: 'udp',
        ip: '0.0.0.0',
        announcedAddress: '203.0.113.7',
        port: 40000
      },
      {
        protocol: 'tcp',
        ip: '0.0.0.0',
        announcedAddress: '203.0.113.7',
        port: 40000
      }
    ]);
  });

  test('adds IPv6-only listeners on the same port', () => {
    const { listenInfos } = buildListenInfos(
      40000,
      '203.0.113.7',
      '2001:db8::7'
    );
    const v6 = listenInfos.filter(({ ip }) => ip === '::');

    expect(listenInfos).toHaveLength(4);
    expect(v6.map(({ protocol }) => protocol)).toEqual(['udp', 'tcp']);

    for (const info of v6) {
      expect(info).toMatchObject({
        announcedAddress: '2001:db8::7',
        port: 40000,
        flags: { ipv6Only: true }
      });
    }
  });

  test('binds no TCP listener when tcp is off', () => {
    const { listenInfos } = buildListenInfos(
      40000,
      '203.0.113.7',
      '2001:db8::7',
      false
    );

    expect(listenInfos.map(({ protocol, ip }) => [protocol, ip])).toEqual([
      ['udp', '0.0.0.0'],
      ['udp', '::']
    ]);
  });
});
