import dns from 'dns';
import http from 'http';
import https from 'https';
import { isIP, type LookupFunction } from 'net';
import { isFetchableUrl, isPrivateIP } from './url-guard';

// One bounded GET of a member-supplied URL (link previews, the image
// proxy). The server is fetching what a member told it to, so every step is
// limited:
//   - only http(s) to a public address (url-guard), checked again on every
//     redirect hop;
//   - the connection goes to the exact address that was checked (lookup is
//     pinned), so a DNS name cannot answer "public" to the check and
//     "127.0.0.1" to the connect;
//   - one deadline for connecting, headers and body (the DNS lookup before
//     each hop has the resolver's own timeout);
//   - a cap on how much body is read.
const MAX_REDIRECTS = 3;
// longest member-supplied URL the server will fetch
const MAX_URL_LENGTH = 2_048;
const EMPTY = Buffer.alloc(0);

type TResolvedHost = { address: string; family: 4 | 6 };

type TPublicFetchDeps = {
  isAllowedUrl: (url: string) => boolean;
  resolveHost: (hostname: string) => Promise<TResolvedHost>;
};

type TPublicFetchOptions = {
  timeoutMs: number;
  maxBytes: number;
  accept: string;
  // decides from the Content-Type whether the body is read at all
  wantsBody: (contentType: string) => boolean;
  // past maxBytes: keep what was read ('truncate') or fail ('reject')
  overflow: 'truncate' | 'reject';
};

type TPublicResponse = {
  // the URL that answered, after redirects
  url: string;
  contentType: string;
  // empty when wantsBody said no
  body: Buffer;
};

// Every address the name resolves to must be public: a name with one
// public and one private record could otherwise be steered by retrying.
const resolvePublicHost = async (hostname: string): Promise<TResolvedHost> => {
  const addresses = await dns.promises.lookup(hostname, { all: true });

  if (addresses.length === 0) throw new Error('No addresses found');

  for (const { address } of addresses) {
    if (isPrivateIP(address)) {
      throw new Error('Cannot resolve private IP addresses');
    }
  }

  const { address, family } = addresses[0]!;

  return { address, family: family === 6 ? 6 : 4 };
};

const defaultDeps: TPublicFetchDeps = {
  isAllowedUrl: isFetchableUrl,
  resolveHost: resolvePublicHost
};

type THop = {
  status: number;
  location?: string;
  contentType: string;
  body: Buffer;
};

const fetchHop = async (
  url: URL,
  options: TPublicFetchOptions,
  deps: TPublicFetchDeps,
  signal: AbortSignal
): Promise<THop> => {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');

  // an IP literal was already vetted by isAllowedUrl and needs no lookup
  const resolved = isIP(hostname)
    ? undefined
    : await deps.resolveHost(hostname);

  // net asks for one address or, with autoSelectFamily, for a list
  const lookup: LookupFunction | undefined = resolved
    ? (_hostname, lookupOptions, callback) => {
        if (lookupOptions.all) {
          callback(null, [resolved]);
        } else {
          callback(null, resolved.address, resolved.family);
        }
      }
    : undefined;

  const transport = url.protocol === 'https:' ? https : http;

  return new Promise<THop>((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: 'GET',
        lookup,
        signal,
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; bot)',
          accept: options.accept
        }
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        const contentType = res.headers['content-type'] ?? '';
        const done = (body: Buffer) =>
          resolve({ status, location, contentType, body });

        if (status < 200 || status >= 300 || !options.wantsBody(contentType)) {
          res.destroy();
          done(EMPTY);
          return;
        }

        // an honest upstream says how big it is: do not download maxBytes
        // of something that will be refused anyway
        if (
          options.overflow === 'reject' &&
          Number(res.headers['content-length']) > options.maxBytes
        ) {
          res.destroy();
          reject(new Error('Response too large'));
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;

        res.on('data', (chunk: Buffer) => {
          size += chunk.length;

          if (size <= options.maxBytes) {
            chunks.push(chunk);
            return;
          }

          res.destroy();

          if (options.overflow === 'reject') {
            reject(new Error('Response too large'));
            return;
          }

          chunks.push(
            chunk.subarray(0, chunk.length - (size - options.maxBytes))
          );
          done(Buffer.concat(chunks));
        });
        res.on('end', () => done(Buffer.concat(chunks)));
        res.on('error', reject);
      }
    );

    req.on('error', reject);
    req.end();
  });
};

// undefined when the URL (or a redirect target) may not be fetched, the
// redirects run out, or the final status is not 2xx. Throws on network
// errors, the deadline and an oversized body in 'reject' mode.
const publicGet = async (
  url: string,
  options: TPublicFetchOptions,
  deps: TPublicFetchDeps = defaultDeps
): Promise<TPublicResponse | undefined> => {
  const signal = AbortSignal.timeout(options.timeoutMs);
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!deps.isAllowedUrl(current)) return undefined;

    const response = await fetchHop(new URL(current), options, deps, signal);

    if (response.status >= 300 && response.status < 400 && response.location) {
      // relative Location headers resolve against the hop that sent them
      current = new URL(response.location, current).href;
      continue;
    }

    if (response.status < 200 || response.status >= 300) return undefined;

    return {
      url: current,
      contentType: response.contentType,
      body: response.body
    };
  }

  return undefined;
};

export { MAX_URL_LENGTH, publicGet };
export type { TPublicFetchDeps };
