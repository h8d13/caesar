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

const buildListenInfos = (port: number, announcedAddress: string) => {
  return {
    listenInfos: [
      { protocol: 'udp' as const, ip: '0.0.0.0', announcedAddress, port },
      { protocol: 'tcp' as const, ip: '0.0.0.0', announcedAddress, port }
    ],
    summary: { ip: '0.0.0.0', announcedAddress }
  };
};

const loadMediasoup = async () => {
  const basePort = config.webRtc.port;
  const count = resolveWorkerCount();
  const logLevel = resolveLogLevel();
  const announcedAddress = await resolveAnnouncedAddress();

  logger.info(
    `Spawning ${count} mediasoup worker(s) (logLevel=${logLevel}, basePort=${basePort})`
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
    const { listenInfos, summary } = buildListenInfos(port, announcedAddress);
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

export { getAllWorkers, getListenInfo, getWorkerSlot, loadMediasoup };
export type { WorkerSlot };
