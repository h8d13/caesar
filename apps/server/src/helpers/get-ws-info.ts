import type http from 'http';
import ipaddr from 'ipaddr.js';
import { UAParser } from 'ua-parser-js';
import type { TConnectionInfo } from '../types';
import { TRUSTED_CLIENT_IP_HEADER, TRUSTED_PROXY_HOPS } from '../utils/env';

/** Minimal shape we need from a WebSocket internal properties not in the ws type defs */
interface WsLike {
  _socket?: { remoteAddress?: string };
  socket?: { remoteAddress?: string };
}

// Client IP resolution. The client IP keys login rate limiting, the failed
// login lockout and audit logs, so it must be derived only from sources we
// trust. Forwarding headers (X-Forwarded-For, X-Real-IP, CF-Connecting-IP,
// ...) are trivially spoofable by any client: trusting them blindly lets an
// attacker rotate the rate-limit key per request and bypass every per-IP
// control. We therefore trust ONLY:
//   - the raw socket peer (always; it is the OS-observed connection source),
//   - a fixed number of reverse-proxy hops in X-Forwarded-For (TRUSTED_PROXY_HOPS),
//   - one explicit single-value header for CDN setups (TRUSTED_CLIENT_IP_HEADER).
// See utils/env.ts for the trust knobs.

const MAX_IP_CANDIDATES = 50;
const MAX_HEADER_LENGTH = 2048;

const getHeaderValue = (
  headers: http.IncomingHttpHeaders,
  name: string
): string | undefined => {
  const value = headers[name];

  if (!value) return undefined;

  let result: string;

  if (Array.isArray(value)) {
    result = value
      .map((v) => v.trim())
      .filter(Boolean)
      .join(',');
  } else {
    result = value.trim();
  }

  if (!result || result.length > MAX_HEADER_LENGTH) return undefined;

  return result;
};

const toCanonical = (
  parsed: ipaddr.IPv4 | ipaddr.IPv6
): ipaddr.IPv4 | ipaddr.IPv6 => {
  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) return v6.toIPv4Address();
  }
  return parsed;
};

const normalizeIp = (value: string): string | undefined => {
  try {
    let candidate = value.trim();

    if (!candidate) return undefined;

    candidate = candidate.replace(/^["']|["']$/g, '');

    if (candidate.startsWith('[') && candidate.includes(']')) {
      candidate = candidate.slice(1, candidate.indexOf(']'));
    }

    // bare "ipv4:port" -> strip the port (a lone colon plus a dotted quad).
    const colonCount = candidate.split(':').length - 1;

    if (colonCount === 1 && candidate.includes('.')) {
      const host = candidate.slice(0, candidate.indexOf(':'));
      if (ipaddr.isValid(host)) {
        candidate = host;
      }
    }

    if (!ipaddr.isValid(candidate)) return undefined;

    return toCanonical(ipaddr.parse(candidate)).toString();
  } catch {
    return undefined;
  }
};

// First syntactically valid IP among raw candidates, in order. Used for the
// socket peer chain (ws._socket / ws.socket / req.socket) which is not
// attacker-controlled, so "first valid" is the right pick.
const firstValidIp = (
  candidates: (string | undefined)[]
): string | undefined => {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const ip = normalizeIp(candidate);
    if (ip) return ip;
  }
  return undefined;
};

// Split X-Forwarded-For into an ordered (left -> right) list. The list is
// capped from the RIGHT so an attacker who prepends thousands of bogus
// entries can never push the trusted suffix (added by our own proxies) out
// of range.
const splitForwardedChain = (value: string): string[] =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(-MAX_IP_CANDIDATES);

type TProxyTrust = {
  trustedProxyHops: number;
  trustedClientIpHeader: string;
};

// Pure, dependency-free resolver so the trust matrix is unit-testable without
// booting the server config module.
const resolveClientIp = (
  headers: http.IncomingHttpHeaders,
  socketCandidates: (string | undefined)[],
  trust: TProxyTrust
): string | undefined => {
  const socketIp = firstValidIp(socketCandidates);

  // 1. CDN single-value header (only when explicitly configured).
  if (trust.trustedClientIpHeader) {
    const raw = getHeaderValue(headers, trust.trustedClientIpHeader);
    if (raw) {
      const ip = normalizeIp(raw.split(',')[0] ?? raw);
      if (ip) return ip;
    }
    // Configured but missing/garbage: do NOT fall through to spoofable XFF.
    return socketIp;
  }

  // 2. Trusted reverse-proxy hops via X-Forwarded-For.
  if (trust.trustedProxyHops > 0) {
    const xff = getHeaderValue(headers, 'x-forwarded-for');
    if (xff) {
      const chain = splitForwardedChain(xff);
      // Each trusted proxy appends the peer it saw to the right end. With N
      // trusted hops the real client is the Nth entry from the right; entries
      // further left are client-supplied and untrusted. If the chain is
      // shorter than expected the request did not traverse all proxies, so we
      // fall back to the socket peer rather than trust a spoofable leftmost.
      const index = chain.length - trust.trustedProxyHops;
      if (index >= 0) {
        const ip = normalizeIp(chain[index]!);
        if (ip) return ip;
      }
    }
    return socketIp;
  }

  // 3. No trusted proxy: app is directly exposed. Only the socket peer is
  // trustworthy; ignore all forwarding headers.
  return socketIp;
};

const getWsIp = (
  ws: unknown,
  req: http.IncomingMessage | undefined
): string | undefined => {
  const headers = req?.headers ?? {};
  const wsObj = ws as WsLike | undefined;

  const socketCandidates = [
    wsObj?._socket?.remoteAddress,
    wsObj?.socket?.remoteAddress,
    req?.socket?.remoteAddress
  ];

  return resolveClientIp(headers, socketCandidates, {
    trustedProxyHops: TRUSTED_PROXY_HOPS,
    trustedClientIpHeader: TRUSTED_CLIENT_IP_HEADER
  });
};

const getWsInfo = (
  ws: unknown,
  req: http.IncomingMessage | undefined
): TConnectionInfo | undefined => {
  if (!ws && !req) return undefined;

  const ip = getWsIp(ws, req);
  const userAgent = req?.headers?.['user-agent'] || undefined;

  if (!ip && !userAgent) return undefined;

  let os: string | undefined;
  let device: string | undefined;

  if (userAgent) {
    try {
      const result = new UAParser(userAgent).getResult();

      os = result.os.name
        ? [result.os.name, result.os.version].filter(Boolean).join(' ')
        : undefined;

      device = result.device.type
        ? [result.device.vendor, result.device.model]
            .filter(Boolean)
            .join(' ')
            .trim() || undefined
        : 'Desktop';
    } catch {
      // agent parsing failed, ignore and proceed with undefined values
    }
  }

  return { ip, os, device, userAgent };
};

export { getWsInfo, resolveClientIp };
