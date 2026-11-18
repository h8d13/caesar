import dns from 'dns/promises';
import mediasoup from 'mediasoup';
import { config } from '../config.js';
import { getErrorMessage } from '../helpers/get-error-message.js';
import { parseSite } from '../helpers/parse-site.js';
import { logger } from '../logger.js';
import { IS_PRODUCTION } from './env.js';

type WorkerSlot = {
  index: number;
  worker: mediasoup.types.Worker;
  webRtcServer: mediasoup.types.WebRtcServer;
};

const workers: WorkerSlot[] = [];
let webRtcServerListenInfo: { ip: string; announcedAddress?: string } = {
  ip: '127.0.0.1'
};

const resolveWorkerCount = (): number => {
  const cfg = config.webRtc.workers;
  return cfg && cfg > 0 ? cfg : 1;
};

const resolveLogLevel = (): mediasoup.types.WorkerLogLevel => {
  const fromEnv = process.env.CAESAR_WEBRTC_LOG_LEVEL as
    | mediasoup.types.WorkerLogLevel
    | undefined;
  if (
    fromEnv === 'debug' ||
    fromEnv === 'warn' ||
    fromEnv === 'error' ||
    fromEnv === 'none'
  ) {
    return fromEnv;
  }
  return IS_PRODUCTION ? 'warn' : 'debug';
};

// Always 0.0.0.0: dev runs in a container too, where 127.0.0.1 is the
// container's own loopback and unreachable through published ports.
// Announced as CAESAR_SITE's host: mediasoup is ICE-lite and can't discover
// its public address, but the domain clients already reach over HTTPS points
// at it. Resolved here to IPv4 (matching the listen): Firefox drops FQDN
// remote candidates, so a hostname leaves it with nothing to connect to.
// Resolved once at boot, a DNS change needs a restart. Set
// CAESAR_WEBRTC_ANNOUNCED_ADDRESS when the domain doesn't resolve to this
// host, e.g. behind a proxy that doesn't forward UDP.
const SITE_HOST = parseSite(process.env.CAESAR_SITE).host;

const resolveAnnouncedAddress = async (): Promise<string> => {
  const host = config.webRtc.announcedAddress || SITE_HOST;
  const { address } = await dns.lookup(host, { family: 4 });
  return address;
};

// IPv6 is opt in (CAESAR_WEBRTC_ANNOUNCED_ADDRESS_V6, an address or a
// hostname with an AAAA record): the container's published ports must
// carry IPv6 as well, which a default Docker/Podman network does not.
// Anything that does not give an IPv6 address leaves it off rather than
// announcing candidates nobody can reach.
const resolveAnnouncedAddressV6 = async (): Promise<string | undefined> => {
  const host = config.webRtc.announcedAddressV6.trim();

  if (!host) return undefined;

  try {
    const { address } = await dns.lookup(host, { family: 6 });

    return address;
  } catch {
    logger.warn(
      `CAESAR_WEBRTC_ANNOUNCED_ADDRESS_V6 "${host}" gives no IPv6 address, IPv6 voice is disabled`
    );

    return undefined;
  }
};

// The IPv6 listeners sit next to the IPv4 ones on the same port: ipv6Only
// keeps '::' from also claiming the IPv4 side 0.0.0.0 already holds.
// The media ports face the internet directly (no Caddy in front). UDP junk
// is dropped per packet, but a TCP listener holds state per connection and
// can be flooded: tcp=false (CAESAR_WEBRTC_TCP) binds no TCP socket at all.
const buildListenInfos = (
  port: number,
  announcedAddress: string,
  announcedAddressV6?: string,
  tcp = true
) => {
  const protocols: mediasoup.types.TransportProtocol[] = tcp
    ? ['udp', 'tcp']
    : ['udp'];
  const listenInfos: mediasoup.types.TransportListenInfo[] = protocols.map(
    (protocol) => ({ protocol, ip: '0.0.0.0', announcedAddress, port })
  );

  if (announcedAddressV6) {
    const v6 = {
      ip: '::',
      announcedAddress: announcedAddressV6,
      port,
      flags: { ipv6Only: true }
    };

    listenInfos.push(...protocols.map((protocol) => ({ protocol, ...v6 })));
  }

  return {
    listenInfos,
    summary: { ip: '0.0.0.0', announcedAddress }
  };
};

const loadMediasoup = async () => {
  const basePort = config.webRtc.port;
  const count = resolveWorkerCount();
  const logLevel = resolveLogLevel();
  const announcedAddress = await resolveAnnouncedAddress();
  const announcedAddressV6 = await resolveAnnouncedAddressV6();

  logger.info(
    `Spawning ${count} mediasoup worker(s) (logLevel=${logLevel}, basePort=${basePort}, tcp=${config.webRtc.tcp ? 'on' : 'off'}, ipv6=${announcedAddressV6 ?? 'off'})`
  );

  for (let i = 0; i < count; i++) {
    const workerConfig = {
      logLevel,
      disableLiburing: true
    };

    let worker: mediasoup.types.Worker;
    try {
      worker = await mediasoup.createWorker(workerConfig);
    } catch (error) {
      logger.error(
        `Failed to load mediasoup worker ${i}: ${getErrorMessage(error)}`
      );
      throw error;
    }

    worker.on('died', (error) => {
      logger.error(`Mediasoup worker ${i} died`, error);
      setTimeout(() => process.exit(0), 2000);
    });

    const port = basePort + i;
    const { listenInfos, summary } = buildListenInfos(
      port,
      announcedAddress,
      announcedAddressV6,
      config.webRtc.tcp
    );
    const webRtcServer = await worker.createWebRtcServer({ listenInfos });

    if (i === 0) webRtcServerListenInfo = summary;

    workers.push({ index: i, worker, webRtcServer });
    logger.debug(`Mediasoup worker ${i} ready on port ${port}`);
  }
};

const getAllWorkers = (): readonly WorkerSlot[] => workers;

const getWorkerSlot = (index: number): WorkerSlot => {
  const slot = workers[index];
  if (!slot) throw new Error(`Worker slot ${index} not found`);
  return slot;
};

const getListenInfo = () => webRtcServerListenInfo;

export {
  buildListenInfos,
  getAllWorkers,
  getListenInfo,
  getWorkerSlot,
  loadMediasoup
};
export type { WorkerSlot };
