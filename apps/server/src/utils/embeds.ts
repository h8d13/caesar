import fs from 'fs/promises';
import path from 'path';
import {
  DRIZZLE_PATH,
  INTERFACE_PATH,
  SRC_MIGRATIONS_PATH
} from '../helpers/paths';
import { logger } from '../logger';
import { IS_DEVELOPMENT, IS_TEST } from '../utils/env';

// Prod assets (interface, drizzle migrations) are staged
// in the Docker image at /app/static-prod-assets and copied into the data
// dir on each boot: the deploy artifact is the source of truth, the data
// volume is re-synced per restart.

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
    await fs.cp(path.join(STATIC_ASSETS_DIR, 'interface'), INTERFACE_PATH, {
      recursive: true
    });
  } catch (error) {
    logger.error('Failed to copy interface assets:', error);
    process.exit(1);
  }

  // Drizzle migrations.
  try {
    logger.debug('Extracting drizzle migrations');
    await fs.rm(DRIZZLE_PATH, { recursive: true, force: true });
    await fs.cp(path.join(STATIC_ASSETS_DIR, 'drizzle'), DRIZZLE_PATH, {
      recursive: true
    });
  } catch (error) {
    logger.error('Failed to copy drizzle migrations:', error);
    process.exit(1);
  }
};

export { loadEmbeds };
