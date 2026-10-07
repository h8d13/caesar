import fs from 'fs/promises';
import z from 'zod';
import { applyEnvOverrides } from './helpers/apply-env-overrides';
import { ensureServerDirs } from './helpers/ensure-server-dirs';
import { iniDefaults, parseIniConfig } from './helpers/ini-config';
import { getPrivateIp, getPublicIp } from './helpers/network';
import { CONFIG_INI_PATH } from './helpers/paths';
import { IS_DEVELOPMENT } from './utils/env';

const [SERVER_PUBLIC_IP, SERVER_PRIVATE_IP] = await Promise.all([
  getPublicIp(),
  getPrivateIp()
]);

// ---------------------------------------------------------------------------
// Env-backed config: deploy/infra knobs. Set via environment (docker-compose),
// never written to config.ini. The defaults below apply when the var is unset.
// ---------------------------------------------------------------------------
const zEnvConfig = z.object({
  server: z.object({
    port: z.coerce.number().int().positive(),
    debug: z.coerce.boolean(),
    // Hard cap on buffered request bodies (login/2fa). Prevents an
    // unauthenticated peer from streaming a huge body into memory before
    // any auth or rate-limit check runs.
    maxRequestBodyBytes: z.coerce.number().int().positive()
  }),
  webRtc: z.object({
    port: z.coerce.number().int().positive(),
    announcedAddress: z.string(),
    maxBitrate: z.coerce.number().int().positive(),
    workers: z.coerce.number().int().nonnegative()
  }),
  limits: z.object({
    // 0 = unlimited. Counts active (non-deleted) users; banned still count.
    // Bootstrap (count==0) always bypasses so the first admin can register.
    maxUsers: z.coerce.number().int().nonnegative()
  })
});

type TEnvConfig = z.infer<typeof zEnvConfig>;

const envDefaults: TEnvConfig = {
  server: {
    port: 4991,
    debug: IS_DEVELOPMENT,
    maxRequestBodyBytes: 64 * 1024
  },
  webRtc: {
    port: 40000,
    announcedAddress: '',
    maxBitrate: 30_000_000, // 30 Mbps
    // each worker binds basePort + i, must match exposed port range
    workers: 1
  },
  limits: {
    maxUsers: 0
  }
};

const envConfig = zEnvConfig.parse(
  applyEnvOverrides(structuredClone(envDefaults), {
    'server.port': 'CAESAR_PORT',
    'server.debug': 'CAESAR_DEBUG',
    'server.maxRequestBodyBytes': 'CAESAR_MAX_REQUEST_BODY_BYTES',
    'webRtc.port': 'CAESAR_WEBRTC_PORT',
    'webRtc.announcedAddress': 'CAESAR_WEBRTC_ANNOUNCED_ADDRESS',
    'webRtc.maxBitrate': 'CAESAR_WEBRTC_MAX_BITRATE',
    'webRtc.workers': 'CAESAR_WEBRTC_WORKERS',
    'limits.maxUsers': 'CAESAR_MAX_USERS'
  })
);

// ---------------------------------------------------------------------------
// Ini-backed config: rate-limiter policy, see helpers/ini-config. Read-only:
// absent file = defaults, bad file = boot error naming the keys.
// ---------------------------------------------------------------------------
const loadIniConfig = async () => {
  const stat = await fs.stat(CONFIG_INI_PATH).catch(() => undefined);

  if (!stat) return iniDefaults;

  // A bind mount of a missing host file makes docker/podman create a
  // directory in its place; say so instead of failing with EISDIR.
  if (stat.isDirectory()) {
    throw new Error(
      `${CONFIG_INI_PATH} is a directory: config.ini was missing next to ` +
        'docker-compose.yaml when the container was created. Download it, ' +
        'remove the directory, then recreate the container.'
    );
  }

  return parseIniConfig(await fs.readFile(CONFIG_INI_PATH, 'utf-8'));
};

await ensureServerDirs();

const iniConfig = await loadIniConfig();

const config = Object.freeze({ ...envConfig, ...iniConfig });

export { config, SERVER_PRIVATE_IP, SERVER_PUBLIC_IP };
