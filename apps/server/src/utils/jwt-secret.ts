import crypto from 'crypto';
import path from 'path';
import { DATA_PATH } from '../helpers/paths';
import { logger } from '../logger';
import { readOrCreateKeyFile } from './key-file';

// Dedicated signing key for session / pre-2fa JWTs. Lives in a file on the
// persistent data volume, NOT the settings table, for two reasons:
//   1. it is a full 256-bit CSPRNG secret instead of sha256(UUIDv7), which
//      only carried ~74 bits of randomness from the v7 layout;
//   2. it can never leak through a settings query the way `secretToken` could.
// `secretToken` is the owner-claim check (usable only while the server has
// no owner) and the key of the WebAuthn user handle; IP and file HMACs have
// their own key (hmac-secret.ts). It is not a JWT signing key.
const JWT_KEY_PATH = path.join(DATA_PATH, 'jwt.key');

let jwtSecret: string | undefined;

const loadJwtSecret = async (): Promise<string> => {
  if (jwtSecret) return jwtSecret;

  const { key, created } = readOrCreateKeyFile(JWT_KEY_PATH);

  if (created) {
    logger.info('[Auth] Generated new JWT signing key at %s', JWT_KEY_PATH);
  }

  return (jwtSecret = key);
};

// Lazy accessor so request-time sign paths work even when boot init was
// skipped (e.g. tests that drive the DB layer directly).
const getJwtSecret = (): Promise<string> => loadJwtSecret();

// Session and pre-2FA tokens are compact JWTs, HS256 only, signed with
// jwt.key (secretToken never signs sessions). Signing and verifying are the
// two functions below instead of a library: one fixed algorithm, one key,
// so there is no algorithm negotiation to get wrong ("none", RS/HS
// confusion), and nothing else in the dependency tree touches the token.
const HEADER = Buffer.from(
  JSON.stringify({ alg: 'HS256', typ: 'JWT' })
).toString('base64url');

const sign = (data: string, secret: string): Buffer =>
  crypto.createHmac('sha256', secret).update(data).digest();

const signJwt = async (
  payload: Record<string, unknown>,
  expiresInSeconds: number
): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({ ...payload, iat: now, exp: now + expiresInSeconds })
  ).toString('base64url');
  const data = `${HEADER}.${body}`;

  return `${data}.${sign(data, await getJwtSecret()).toString('base64url')}`;
};

const parsePart = (part: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(
    Buffer.from(part, 'base64url').toString('utf8')
  );

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid token');
  }

  return value as Record<string, unknown>;
};

// Throws on anything but a token we signed that has not expired. A token
// without an exp is refused: every token minted here carries one.
const verifyJwt = async <T>(token: string): Promise<T> => {
  const parts = token.split('.');

  if (parts.length !== 3) throw new Error('invalid token');

  const [header, body, signature] = parts as [string, string, string];

  if (parsePart(header).alg !== 'HS256') throw new Error('invalid algorithm');

  const expected = sign(`${header}.${body}`, await getJwtSecret());
  const provided = Buffer.from(signature, 'base64url');

  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    throw new Error('invalid signature');
  }

  const payload = parsePart(body);

  if (
    typeof payload.exp !== 'number' ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error('token expired');
  }

  return payload as T;
};

// The payload without checking the signature: only for reading a claim of
// a token this server just minted or already verified.
const decodeJwt = <T>(token: string): T | null => {
  try {
    return parsePart(token.split('.')[1] ?? '') as T;
  } catch {
    return null;
  }
};

export { decodeJwt, getJwtSecret, loadJwtSecret, signJwt, verifyJwt };
