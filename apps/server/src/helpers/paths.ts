import path from 'path';
import { IS_DEVELOPMENT, IS_TEST, SERVER_VERSION } from '../utils/env';
import { getAppDataPath } from './fs';

// In test mode, each vitest fork gets its own data dir so parallel forks
// don't race on tmp/public/uploads. VITEST_POOL_ID is set per worker
// (1-indexed); falls back to plain `data-test` for non-vitest test runs.
const TEST_DATA_SUFFIX = process.env.VITEST_POOL_ID
  ? `-${process.env.VITEST_POOL_ID}`
  : '';
const DATA_PATH = IS_TEST
  ? path.resolve(process.cwd(), `./data-test${TEST_DATA_SUFFIX}`)
  : IS_DEVELOPMENT
    ? path.resolve(process.cwd(), './data')
    : path.join(getAppDataPath(), 'caesar');
const DB_PATH = path.join(DATA_PATH, 'db.sqlite');
const PUBLIC_PATH = path.join(DATA_PATH, 'public');
const TMP_PATH = path.join(DATA_PATH, 'tmp');
const UPLOADS_PATH = path.join(DATA_PATH, 'uploads');
const INTERFACE_PATH = path.resolve(DATA_PATH, 'interface', SERVER_VERSION);
const DRIZZLE_PATH = path.resolve(DATA_PATH, 'drizzle');
const MEDIASOUP_PATH = path.resolve(DATA_PATH, 'mediasoup');
const CONFIG_INI_PATH = path.resolve(DATA_PATH, 'config.ini');
const MEDIASOUP_BINARY_PATH = IS_DEVELOPMENT
  ? undefined
  : path.join(MEDIASOUP_PATH, 'mediasoup-worker');
const SRC_MIGRATIONS_PATH = path.join(process.cwd(), 'src', 'db', 'migrations');

// logs live with docker / operator, not persisted on disk.

export {
  CONFIG_INI_PATH,
  DATA_PATH,
  DB_PATH,
  DRIZZLE_PATH,
  INTERFACE_PATH,
  MEDIASOUP_BINARY_PATH,
  MEDIASOUP_PATH,
  PUBLIC_PATH,
  SRC_MIGRATIONS_PATH,
  TMP_PATH,
  UPLOADS_PATH
};
