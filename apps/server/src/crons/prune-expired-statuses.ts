import { statusImages } from '@caesar/shared/db/schema';
import { eq, lte } from 'drizzle-orm';
import { db } from '../db';
import { removeFile } from '../db/mutations/files';
import { publishUser } from '../db/publishers';
import { logger } from '../logger';

// Reclaim status images ("stories") past their 24h expiry: delete the row,
// reclaim the file (disk + record), then publish each affected user once so
// their avatar ring clears live. Mirrors prune-expired (messages).
const pruneExpiredStatuses = async () => {
  const now = Date.now();

  const expired = await db
    .select({
      id: statusImages.id,
      userId: statusImages.userId,
      fileId: statusImages.fileId
    })
    .from(statusImages)
    .where(lte(statusImages.expiresAt, now));

  if (expired.length === 0) return;

  logger.info(`[Cron] Pruning ${expired.length} expired statuses...`);

  const affectedUserIds = new Set<number>();

  for (const s of expired) {
    await db.delete(statusImages).where(eq(statusImages.id, s.id)).run();
    await removeFile(s.fileId);
    affectedUserIds.add(s.userId);
  }

  for (const userId of affectedUserIds) {
    publishUser(userId, 'update');
  }
};

export { pruneExpiredStatuses };
