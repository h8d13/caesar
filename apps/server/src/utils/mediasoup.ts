import mediasoup from 'mediasoup';
import { config, SERVER_PUBLIC_IP } from '../config.js';
import { getErrorMessage } from '../helpers/get-error-message.js';
import { logger } from '../logger.js';
import { IS_PRODUCTION } from './env.js';

type WorkerSlot = {
  index: number;
  worker: mediasoup.types.Worker<mediasoup.types.AppData>;
  webRtcServer: mediasoup.types.WebRtcServer<mediasoup.types.AppData>;
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
// container's own loopback and unreachable through published ports. Dev
// clients sit on the same host, so it announces 127.0.0.1 (compose.dev.yaml
// publishes on host loopback only).
const buildListenInfos = (port: number) => {
  const announcedAddress =
    config.webRtc.announcedAddress ||
    (IS_PRODUCTION ? SERVER_PUBLIC_IP : '127.0.0.1');

  return {
    listenInfos: [
      { protocol: 'udp' as const, ip: '0.0.0.0', announcedAddress, port },
      { protocol: 'tcp' as const, ip: '0.0.0.0', announcedAddress, port }
    ],
    summary: { ip: '0.0.0.0', announcedAddress }
  };
};

const loadMediasoup = async () => {
  const basePort = +config.webRtc.port;
  const count = resolveWorkerCount();
  const logLevel = resolveLogLevel();

  logger.info(
    `Spawning ${count} mediasoup worker(s) (logLevel=${logLevel}, basePort=${basePort})`
  );

  for (let i = 0; i < count; i++) {
    const workerConfig = {
      logLevel,
      disableLiburing: true
    };

    let worker: mediasoup.types.Worker<mediasoup.types.AppData>;
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
    const { listenInfos, summary } = buildListenInfos(port);
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
