import { existsSync } from 'fs';
import fs from 'fs/promises';
import { parse, stringify } from 'ini';
import z from 'zod';
import { applyEnvOverrides } from './helpers/apply-env-overrides';
import { deepMerge } from './helpers/deep-merge';
import { ensureServerDirs } from './helpers/ensure-server-dirs';
import { getErrorMessage } from './helpers/get-error-message';
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
// Ini-backed config: rate-limiter policy. Persisted to config.ini and migrated
// in place (read -> merge with defaults -> validate -> write back), so adding
// or removing a limiter never needs a manual config migration.
// ---------------------------------------------------------------------------
const zIniConfig = z.object({
  rateLimiters: z.object({
    sendAndEditMessage: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    joinVoiceChannel: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    joinServer: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    signalTyping: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    getMessages: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    markAsRead: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    toggleMessageReaction: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    addEmoji: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    openDirectMessage: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    handshake: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    publicFile: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    updatePassword: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    uploadFile: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    searchMessages: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    deleteMessage: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    toggleMessagePin: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    toggleMessageScVote: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    voteSocialCredit: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    renameIdentity: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    addInvite: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    changeAvatar: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    changeBanner: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    }),
    playSoundboard: z.object({
      maxRequests: z.coerce.number().int().positive(),
      windowMs: z.coerce.number().int().positive()
    })
  }),
  // Failed-login lockout: escalating, IP-keyed, sits behind the joinServer
  // burst limiter. After maxFailures failures inside windowMs the IP is locked
  // for baseLockMs, doubling per extra failure up to maxLockMs.
  loginLockout: z.object({
    maxFailures: z.coerce.number().int().positive(),
    windowMs: z.coerce.number().int().positive(),
    baseLockMs: z.coerce.number().int().positive(),
    maxLockMs: z.coerce.number().int().positive()
  })
});

type TIniConfig = z.infer<typeof zIniConfig>;

const iniDefaults: TIniConfig = {
  rateLimiters: {
    sendAndEditMessage: {
      maxRequests: 15,
      windowMs: 60_000
    },
    joinVoiceChannel: {
      maxRequests: 20,
      windowMs: 60_000
    },
    joinServer: {
      maxRequests: 5,
      windowMs: 60_000
    },
    signalTyping: {
      maxRequests: 40,
      windowMs: 5_000
    },
    getMessages: {
      maxRequests: 60,
      windowMs: 10_000
    },
    markAsRead: {
      maxRequests: 60,
      windowMs: 10_000
    },
    toggleMessageReaction: {
      maxRequests: 60,
      windowMs: 10_000
    },
    addEmoji: {
      maxRequests: 10,
      windowMs: 60_000
    },
    openDirectMessage: {
      maxRequests: 10,
      windowMs: 60_000
    },
    handshake: {
      maxRequests: 10,
      windowMs: 60_000
    },
    publicFile: {
      maxRequests: 120,
      windowMs: 60_000
    },
    updatePassword: {
      maxRequests: 5,
      windowMs: 60_000
    },
    uploadFile: {
      maxRequests: 20,
      windowMs: 60_000
    },
    searchMessages: {
      maxRequests: 20,
      windowMs: 60_000
    },
    deleteMessage: {
      maxRequests: 30,
      windowMs: 60_000
    },
    toggleMessagePin: {
      maxRequests: 30,
      windowMs: 60_000
    },
    toggleMessageScVote: {
      maxRequests: 30,
      windowMs: 60_000
    },
    voteSocialCredit: {
      maxRequests: 20,
      windowMs: 60_000
    },
    renameIdentity: {
      maxRequests: 5,
      windowMs: 60_000
    },
    addInvite: {
      maxRequests: 10,
      windowMs: 60_000
    },
    changeAvatar: {
      maxRequests: 10,
      windowMs: 60_000
    },
    changeBanner: {
      maxRequests: 10,
      windowMs: 60_000
    },
    playSoundboard: {
      maxRequests: 30,
      windowMs: 60_000
    }
  },
  loginLockout: {
    maxFailures: 10,
    windowMs: 15 * 60_000, // 15 minutes
    baseLockMs: 5 * 60_000, // 5 minutes
    maxLockMs: 60 * 60_000 // 1 hour
  }
};

let iniConfig: TIniConfig = structuredClone(iniDefaults);

await ensureServerDirs();

const configExists = existsSync(CONFIG_INI_PATH);

if (!configExists) {
  // config does not exist, create it with the default config
  await fs.writeFile(CONFIG_INI_PATH, stringify(iniConfig));
} else {
  try {
    // config exists, we need to make sure it is up to date with the schema
    // to make this easy, we will read the existing config, merge it with the default config, and write it back to the file
    // this way we don't have to worry about migrating old config files when we add/remove config options
    const existingConfigText = await fs.readFile(CONFIG_INI_PATH, {
      encoding: 'utf-8'
    });

    const existingConfig = parse(existingConfigText) as Partial<TIniConfig>;
    const mergedConfig = deepMerge(iniConfig, existingConfig);

    // parse strips unknown keys, so any legacy [server]/[webRtc]/[limits]
    // sections left in an old config.ini are dropped on write-back.
    iniConfig = zIniConfig.parse(mergedConfig);

    await fs.writeFile(CONFIG_INI_PATH, stringify(iniConfig));
  } catch (error) {
    // something went wrong, just log the error and overwrite the config file with the default config
    console.error(
      `Error reading or parsing config.ini. Overwriting with default config. Error: ${getErrorMessage(error)}`
    );

    await fs.writeFile(CONFIG_INI_PATH, stringify(iniConfig));
  }
}

const config = Object.freeze({ ...envConfig, ...iniConfig });

export { config, SERVER_PRIVATE_IP, SERVER_PUBLIC_IP };
