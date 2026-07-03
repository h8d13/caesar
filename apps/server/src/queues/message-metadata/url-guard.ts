import ipaddr from 'ipaddr.js';
import { isIP } from 'net';

// Block IP ranges that could reach the loopback interface, link-local
// metadata endpoints (169.254.169.254), or internal/private networks. A
// parse failure fails closed (treated as private).
const isPrivateIP = (ip: string): boolean => {
  try {
    const addr = ipaddr.parse(ip);
    const range = addr.range();

    const blockedRanges = [
      'unspecified',
      'broadcast',
      'multicast',
      'linkLocal',
      'loopback',
      'private',
      'uniqueLocal'
    ];

    return blockedRanges.includes(range);
  } catch {
    return true; // if we can't parse it, block it
  }
};

// A URL is safe to fetch server-side only if it is http/https and, when the
// host is already a literal IP, that IP is not private. DNS-name hosts are
// validated separately at resolve time (resolveDNSHost). Reused for the
// initial URL and for every redirect hop so both take the same path.
const isFetchableUrl = (url: string): boolean => {
  if (!URL.canParse(url)) return false;

  const parsed = new URL(url);

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  // URL wraps IPv6 literals in brackets (e.g. "[::1]"), which isIP rejects.
  // Strip them so an IPv6 loopback/private literal is actually checked.
  const host = parsed.hostname.replace(/^\[|\]$/g, '');

  if (isIP(host) && isPrivateIP(host)) {
    return false;
  }

  return true;
};

export { isFetchableUrl, isPrivateIP };
