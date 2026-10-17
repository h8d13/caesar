import { removeFile } from '../db/mutations/files';
import { getOrphanedFileIds } from '../db/queries/files';
import { logger } from '../logger';

// files newer than this may still be between save and link
const ORPHAN_GRACE_MS = 60 * 60 * 1000;

const cleanupFiles = async () => {
  logger.debug('[Cron] Starting file cleanup...');

  const orphanedFileIds = await getOrphanedFileIds({
    minAgeMs: ORPHAN_GRACE_MS
  });

  if (orphanedFileIds.length === 0) {
    logger.debug('[Cron] No orphaned files found.');
    return;
  }

  logger.info(
    `[Cron] Found ${orphanedFileIds.length} orphaned files. Cleaning up...`
  );

  const promises = orphanedFileIds.map(async (fileId) => {
    await removeFile(fileId);
  });

  await Promise.all(promises);

  logger.info(`[Cron] Cleaned up ${orphanedFileIds.length} orphaned files.`);
};

export { cleanupFiles };
