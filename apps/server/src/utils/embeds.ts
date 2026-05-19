import fs from 'fs/promises';
import path from 'path';
import {
  DRIZZLE_PATH,
  INTERFACE_PATH,
  MEDIASOUP_PATH,
  SRC_MIGRATIONS_PATH
} from '../helpers/paths';
import { logger } from '../logger';
import { IS_DEVELOPMENT, IS_TEST } from '../utils/env';

// On master (Bun era) this extracted zipped assets from `bun.embeddedFiles`,
// shipping interface/drizzle/mediasoup-worker baked into the single
// compiled executable. The Node migration replaces that with a static
// staging dir baked into the Docker image at /app/static-prod-assets,
// which we copy into the runtime data dir on each boot. Same effect: the
// deploy artifact is the source of truth, the on-disk data volume is
// kept in sync per restart.

const STATIC_ASSETS_DIR = path.join(process.cwd(), 'static-prod-assets');

const loadEmbeds = async () => {
  logger.debug('Loading embedded files...');

  if (IS_DEVELOPMENT || IS_TEST) {
    logger.debug('Development mode, copying migrations from src');
    await fs.cp(SRC_MIGRATIONS_PATH, DRIZZLE_PATH, { recursive: true });
    return;
  }

  // Interface (client static assets). Always refresh so the on-disk copy
  // mirrors what shipped with this build.
  try {
    logger.debug('Extracting interface assets');
    await fs.rm(INTERFACE_PATH, { recursive: true, force: true });
    await fs.cp(
      path.join(STATIC_ASSETS_DIR, 'interface'),
      INTERFACE_PATH,
      { recursive: true }
    );
  } catch (error) {
    logger.error('Failed to copy interface assets:', error);
    process.exit(1);
  }

  // Drizzle migrations.
  try {
    logger.debug('Extracting drizzle migrations');
    await fs.rm(DRIZZLE_PATH, { recursive: true, force: true });
    await fs.cp(
      path.join(STATIC_ASSETS_DIR, 'drizzle'),
      DRIZZLE_PATH,
      { recursive: true }
    );
  } catch (error) {
    logger.error('Failed to copy drizzle migrations:', error);
    process.exit(1);
  }

  // mediasoup-worker binary. fs.cp preserves the executable bit.
  try {
    logger.debug('Extracting mediasoup-worker binary');
    await fs.mkdir(MEDIASOUP_PATH, { recursive: true });
    await fs.cp(
      path.join(STATIC_ASSETS_DIR, 'mediasoup-worker'),
      path.join(MEDIASOUP_PATH, 'mediasoup-worker')
    );
    await fs.chmod(path.join(MEDIASOUP_PATH, 'mediasoup-worker'), 0o755);
  } catch (error) {
    logger.error('Failed to copy mediasoup-worker:', error);
  }
};

export { loadEmbeds };
