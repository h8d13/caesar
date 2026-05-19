import argon2 from 'argon2';

// Thin wrapper to keep callsites in the codebase argument-order-stable.
// Bun.password.verify(password, hash) is reversed vs argon2.verify(hash, password);
// centralizing here means call sites stay as hashPassword(plain) / verifyPassword(plain, hash).
const hashPassword = (password: string): Promise<string> =>
  argon2.hash(password);

const verifyPassword = (password: string, hash: string): Promise<boolean> =>
  argon2.verify(hash, password);

export { hashPassword, verifyPassword };
