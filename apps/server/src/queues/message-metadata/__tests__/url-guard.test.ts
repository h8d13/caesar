import { describe, expect, test } from 'vitest';
import { isFetchableUrl } from '../url-guard';

describe('isFetchableUrl', () => {
  test('allows http(s) URLs with public hosts', () => {
    expect(isFetchableUrl('http://example.com')).toBe(true);
    expect(isFetchableUrl('https://example.com/path?q=1')).toBe(true);
    expect(isFetchableUrl('http://8.8.8.8')).toBe(true);
    expect(isFetchableUrl('http://[2001:4860:4860::8888]/')).toBe(true);
  });

  test('blocks non-http(s) protocols', () => {
    for (const url of [
      'ftp://example.com',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'gopher://example.com',
      'data:text/html,x'
    ]) {
      expect(isFetchableUrl(url)).toBe(false);
    }
  });

  test('blocks literal private, loopback, and link-local IPs', () => {
    for (const url of [
      'http://127.0.0.1',
      'http://127.0.0.1:8080/admin',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.5',
      'http://192.168.1.1',
      'http://172.16.0.1',
      'http://0.0.0.0',
      'http://[::1]/',
      'http://[fc00::1]/'
    ]) {
      expect(isFetchableUrl(url)).toBe(false);
    }
  });

  test('rejects malformed input', () => {
    for (const url of ['not a url', '', 'http://', '://nope']) {
      expect(isFetchableUrl(url)).toBe(false);
    }
  });
});
