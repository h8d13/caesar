import argon2 from 'argon2';
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

// Thin wrapper to keep callsites in the codebase argument-order-stable.
// Bun.password.verify(password, hash) is reversed vs argon2.verify(hash, password);
// centralizing here means call sites stay as hashPassword(plain) / verifyPassword(plain, hash).
const hashPassword = (password: string): Promise<string> =>
  IS_TEST ? argon2.hash(password, TEST_HASH_OPTIONS) : argon2.hash(password);

const verifyPassword = (password: string, hash: string): Promise<boolean> =>
  argon2.verify(hash, password);

export { hashPassword, verifyPassword };
