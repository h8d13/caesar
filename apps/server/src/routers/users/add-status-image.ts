import { statusImages } from '@caesar/shared/db/schema';
import { config } from '@server/config';
import { db } from '@server/db';
import { publishUser } from '@server/db/publishers';
import { getSettings } from '@server/db/queries/server';
import { countActiveStatusImagesByUserId } from '@server/db/queries/status-images';
import { fileManager } from '@server/utils/file-manager';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import z from 'zod';

// Stories live for 24h from upload. Each image expires independently.
const STATUS_IMAGE_TTL_MS = 24 * 60 * 60 * 1000;
// Cap concurrent active stories per user so the lazy viewer fetch and the
// per-user payload stay bounded.
const MAX_ACTIVE_STATUS_IMAGES = 30;

const addStatusImageRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.changeAvatar.maxRequests,
  windowMs: config.rateLimiters.changeAvatar.windowMs,
  logLabel: 'addStatusImage'
})
  .input(
    z.object({
      fileId: z.string()
    })
  )
  .mutation(async ({ ctx, input }) => {
    if (!fileManager.temporaryFileHasMimeType(input.fileId, 'image/')) {
      throw new Error('Invalid file type. Please try again.');
    }

    const activeCount = await countActiveStatusImagesByUserId(ctx.userId);

    invariant(activeCount < MAX_ACTIVE_STATUS_IMAGES, {
      code: 'BAD_REQUEST',
      message: `You can have at most ${MAX_ACTIVE_STATUS_IMAGES} active statuses.`
    });

    const tempFile = await fileManager.getTemporaryFile(input.fileId);

    invariant(tempFile, {
      code: 'NOT_FOUND',
      message: 'Temporary file not found'
    });

    const settings = await getSettings();

    invariant(tempFile.size <= settings.storageMaxAvatarSize, {
      code: 'BAD_REQUEST',
      message: `Status image exceeds the configured maximum size of ${settings.storageMaxAvatarSize / (1024 * 1024)} MB`
    });

    const newFile = await fileManager.saveFile(input.fileId, ctx.userId);

    const now = Date.now();

    await db
      .insert(statusImages)
      .values({
        userId: ctx.userId,
        fileId: newFile.id,
        expiresAt: now + STATUS_IMAGE_TTL_MS,
        createdAt: now
      })
      .run();

    publishUser(ctx.userId, 'update');
  });

export { addStatusImageRoute };
