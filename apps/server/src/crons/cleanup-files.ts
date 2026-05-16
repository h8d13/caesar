import { removeFile } from '../db/mutations/files';
import { getOrphanedFileIds } from '../db/queries/files';
import { logger } from '../logger';

const cleanupFiles = async () => {
  logger.debug('[Cron] Starting file cleanup...');

  const orphanedFileIds = await getOrphanedFileIds();

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
