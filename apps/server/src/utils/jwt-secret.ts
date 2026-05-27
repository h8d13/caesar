import crypto from 'crypto';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { DATA_PATH } from '../helpers/paths';
import { logger } from '../logger';

// Dedicated signing key for session / pre-2fa JWTs. Lives in a file on the
// persistent data volume, NOT the settings table, for two reasons:
//   1. it is a full 256-bit CSPRNG secret instead of sha256(UUIDv7), which
//      only carried ~74 bits of randomness from the v7 layout;
//   2. it can never leak through a settings query the way `secretToken` could.
// `secretToken` stays the internal HMAC key for IP / file / webauthn hashing
// and the one-time owner-spawn check; it is no longer a JWT signing key.
const JWT_KEY_PATH = path.join(DATA_PATH, 'jwt.key');

let jwtSecret: string | undefined;

// Read the key file, or mint and persist one on first boot. Safe under a
// parallel-boot race: `wx` fails if another process already wrote the file,
// in which case we re-read it.
const loadJwtSecret = async (): Promise<string> => {
  if (jwtSecret) return jwtSecret;

  try {
    const existing = (await fs.promises.readFile(JWT_KEY_PATH, 'utf8')).trim();
    if (existing) {
      jwtSecret = existing;
      return jwtSecret;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  const generated = crypto.randomBytes(32).toString('hex');

  try {
    // 0600: readable only by the server user.
    await fs.promises.writeFile(JWT_KEY_PATH, generated, {
      mode: 0o600,
      flag: 'wx'
    });
    jwtSecret = generated;
    logger.info('[Auth] Generated new JWT signing key at %s', JWT_KEY_PATH);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      jwtSecret = (await fs.promises.readFile(JWT_KEY_PATH, 'utf8')).trim();
    } else {
      throw err;
    }
  }

  return jwtSecret;
};

// Lazy accessor so request-time sign paths work even when boot init was
// skipped (e.g. tests that drive the DB layer directly).
const getJwtSecret = (): Promise<string> => loadJwtSecret();

// Verify against the dedicated key only. Sessions signed with the legacy
// pre-split `secretToken` are intentionally not accepted: those users
// re-login once and get a fresh `jwt.key`-signed token.
const verifyJwt = async <T>(token: string): Promise<T> =>
  jwt.verify(token, await getJwtSecret()) as T;

export { getJwtSecret, loadJwtSecret, verifyJwt };
