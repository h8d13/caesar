import {
  AUTH_KEY_INFO,
  canonicalIdentity,
  PASSWORD_KDF,
  PASSWORD_KDF_TEST
} from '@caesar/shared';
import argon2 from 'argon2';
import { createHash, hkdfSync, randomBytes } from 'node:crypto';
import { IS_TEST } from './env';

// Argon2 is deliberately expensive (~100-500ms/op). In the test env that cost
// dominates the suite (every login/signup/password path pays it, and failed
// logins burn a verify for timing safety). Use minimal work factors there:
// verify() reads the parameters back from the hash string, so test/prod
// hashes interoperate. Production keeps the argon2 library defaults.
const TEST_HASH_OPTIONS = {
  memoryCost: 4096, // 4 MiB vs the 64 MiB default
  timeCost: 2,
  parallelism: 1
} as const;

// Hashes the client-derived authKey (see PASSWORD_KDF), never a password.
// Call sites read (plain, hash); argon2.verify takes (hash, plain). Tests
// get cheap hashing params.
const hashPassword = (authKey: string): Promise<string> =>
  IS_TEST ? argon2.hash(authKey, TEST_HASH_OPTIONS) : argon2.hash(authKey);

const verifyPassword = (authKey: string, hash: string): Promise<boolean> =>
  argon2.verify(hash, authKey);

// Server-side mirror of the client's derivation (e2ee.ts derivePriv +
// deriveAuthKey), for passwords the server generates itself.
const deriveAuthKey = async (
  password: string,
  identity: string
): Promise<string> => {
  const { t, m, p, dkLen } = IS_TEST ? PASSWORD_KDF_TEST : PASSWORD_KDF;
  const priv = await argon2.hash(password, {
    type: argon2.argon2id,
    raw: true,
    salt: createHash('sha256').update(canonicalIdentity(identity)).digest(),
    timeCost: t,
    memoryCost: m,
    parallelism: p,
    hashLength: dkLen
  });

  return Buffer.from(
    hkdfSync('sha256', priv, Buffer.alloc(0), AUTH_KEY_INFO, 32)
  ).toString('base64');
};

// 18 random bytes -> 24 base64url chars. The moderator never picks the
// value: a generated one-shot credential can't be a reused/weak password,
// and it is returned exactly once (never stored in plaintext, never
// re-readable) so the mod has to relay it out-of-band.
const TEMPORARY_PASSWORD_BYTES = 18;

// Returns the plaintext and the hash to store for `identity`. authKey is
// salted with the identity, so a rename has to issue one too.
const generateTemporaryPassword = async (identity: string) => {
  const temporaryPassword = randomBytes(TEMPORARY_PASSWORD_BYTES).toString(
    'base64url'
  );

  return {
    temporaryPassword,
    hash: await hashPassword(await deriveAuthKey(temporaryPassword, identity))
  };
};

export {
  deriveAuthKey,
  generateTemporaryPassword,
  hashPassword,
  verifyPassword
};
