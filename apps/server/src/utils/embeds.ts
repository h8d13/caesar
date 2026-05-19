import fs from 'fs/promises';
import { DRIZZLE_PATH, SRC_MIGRATIONS_PATH } from '../helpers/paths';
import { logger } from '../logger';
import { IS_DEVELOPMENT, IS_TEST } from '../utils/env';

// Production used to extract zipped assets from `bun.embeddedFiles` (a
// Bun-specific build feature). On Node, the deploy ships
// interface/drizzle/mediasoup-worker on disk directly. loadEmbeds therefore
// only does the dev-mode migrations copy. If prod ever needs runtime extraction
// again, replace with SEA assets or a zip resource shipped alongside.

const loadEmbeds = async () => {
  logger.debug('Loading embedded files...');

  if (IS_DEVELOPMENT || IS_TEST) {
    logger.debug('Development mode, copying migrations from src');
    await fs.cp(SRC_MIGRATIONS_PATH, DRIZZLE_PATH, { recursive: true });
    return;
  }

  // Prod path: rely on the deploy artifact placing interface/drizzle/
  // mediasoup-worker at their canonical locations. No runtime extraction.
  logger.debug('Production mode, expecting pre-placed assets on disk');
};

export { loadEmbeds };
