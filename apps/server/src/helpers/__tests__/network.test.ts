import { describe, expect, test } from 'vite-plus/test';
import { getIpBlockKey } from '../network';

describe('getIpBlockKey', () => {
  test('keeps ipv4 addresses as is', () => {
    expect(getIpBlockKey('203.0.113.7')).toBe('203.0.113.7');
  });

  test('unwraps ipv4-mapped ipv6 addresses', () => {
    expect(getIpBlockKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  test('groups ipv6 addresses by /64', () => {
    expect(getIpBlockKey('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(getIpBlockKey('2001:db8:1:2:bbbb::9')).toBe('2001:db8:1:2::/64');
    expect(getIpBlockKey('2001:db8:1:3::1')).toBe('2001:db8:1:3::/64');
  });

  test('passes invalid input through', () => {
    expect(getIpBlockKey('unknown')).toBe('unknown');
  });
});
