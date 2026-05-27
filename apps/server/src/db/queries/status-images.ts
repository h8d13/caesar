import type { TJoinedStatusImage } from '@caesar/shared';
import { files, statusImages } from '@caesar/shared/db/schema';
import { and, asc, eq, gt } from 'drizzle-orm';
import { db } from '..';

// Active (non-expired) status images for one user, oldest first, each joined
// with its file. fileId is NOT NULL and FK-bound, so the inner join always
// matches; the cast keeps the TJoinedStatusImage shape (file: TFile).
const getActiveStatusImagesByUserId = async (
  userId: number
): Promise<TJoinedStatusImage[]> => {
  const now = Date.now();

  const rows = await db
    .select({
      statusImage: statusImages,
      file: files
    })
    .from(statusImages)
    .innerJoin(files, eq(statusImages.fileId, files.id))
    .where(
      and(eq(statusImages.userId, userId), gt(statusImages.expiresAt, now))
    )
    .orderBy(asc(statusImages.createdAt))
    .all();

  return rows.map((row) => ({ ...row.statusImage, file: row.file }));
};

const countActiveStatusImagesByUserId = async (
  userId: number
): Promise<number> => {
  const rows = await db
    .select({ id: statusImages.id })
    .from(statusImages)
    .where(
      and(
        eq(statusImages.userId, userId),
        gt(statusImages.expiresAt, Date.now())
      )
    )
    .all();

  return rows.length;
};

export { countActiveStatusImagesByUserId, getActiveStatusImagesByUserId };
