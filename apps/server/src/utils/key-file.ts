import crypto from 'crypto';
import fs from 'fs';

// A 256-bit secret kept in a file on the data volume: read it, or mint and
// persist one on first boot. Returns the key and whether it was just
// created. Safe under a parallel-boot race: `wx` fails if another process
// already wrote the file, in which case theirs is read.
const readOrCreateKeyFile = (
  keyPath: string
): { key: string; created: boolean } => {
  try {
    const existing = fs.readFileSync(keyPath, 'utf8').trim();

    if (existing) return { key: existing, created: false };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  const generated = crypto.randomBytes(32).toString('hex');

  try {
    // 0600: readable only by the server user
    fs.writeFileSync(keyPath, generated, { mode: 0o600, flag: 'wx' });

    return { key: generated, created: true };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;

    return { key: fs.readFileSync(keyPath, 'utf8').trim(), created: false };
  }
};

export { readOrCreateKeyFile };
