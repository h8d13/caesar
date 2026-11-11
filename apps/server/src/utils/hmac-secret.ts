import path from 'path';
import { DATA_PATH } from '../helpers/paths';
import { readOrCreateKeyFile } from './key-file';

// Key for the HMACs that leave the server as opaque values: stored IP
// hashes (hash-ip.ts) and private-file access tokens (files-crypto.ts).
// A file on the data volume, like jwt.key, and for the same reasons. These
// used to be keyed with settings.secretToken, which is sha256(owner token):
// whoever claimed Owner, or read the first-boot log, could derive the key,
// brute-force the 2^32 IPv4 space against any IP hash and mint file tokens.
// Sync: both callers sit on hot, synchronous paths.
const HMAC_KEY_PATH = path.join(DATA_PATH, 'hmac.key');

let hmacSecret: string | undefined;

const getHmacSecret = (): string =>
  (hmacSecret ??= readOrCreateKeyFile(HMAC_KEY_PATH).key);

export { getHmacSecret };
