import ipaddr from 'ipaddr.js';
import { isIP } from 'net';

// Only globally routable unicast is fetchable. An allowlist, because the
// blocklist it replaces missed ranges ipaddr.js reports separately (CGNAT,
// reserved, 6to4, teredo). IPv4-mapped IPv6 (::ffff:127.0.0.1) is unwrapped
// first: its own range is "ipv4Mapped", which would hide the loopback. A
// parse failure fails closed (treated as private).
const isPrivateIP = (ip: string): boolean => {
  try {
    let addr = ipaddr.parse(ip);

    if (addr.kind() === 'ipv6') {
      const v6 = addr as ipaddr.IPv6;

      if (v6.isIPv4MappedAddress()) addr = v6.toIPv4Address();
    }

    return addr.range() !== 'unicast';
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
