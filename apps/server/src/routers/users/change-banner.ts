import { users } from '@caesar/shared/db/schema';
import { config } from '@server/config';
import { db } from '@server/db';
import { removeFile } from '@server/db/mutations/files';
import { publishUser } from '@server/db/publishers';
import { getSettings } from '@server/db/queries/server';
import { getUserById } from '@server/db/queries/users';
import { fileManager } from '@server/utils/file-manager';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import z from 'zod';

const changeBannerRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.changeBanner.maxRequests,
  windowMs: config.rateLimiters.changeBanner.windowMs,
  logLabel: 'changeBanner'
})
  .input(
    z.object({
      fileId: z.string().optional()
    })
  )
  .mutation(async ({ ctx, input }) => {
    if (
      input.fileId &&
      !fileManager.temporaryFileHasMimeType(input.fileId, 'image/')
    ) {
      throw new Error('Invalid file type. Please try again.');
    }

    const user = await getUserById(ctx.userId);

    invariant(user, {
      code: 'NOT_FOUND',
      message: 'User not found'
    });

    // save the new file before touching the old one: if it is rejected
    // (missing, too large, over quota) the user keeps their current banner
    let newBannerId: number | null = null;

    if (input.fileId) {
      const tempFile = fileManager.getTemporaryFile(input.fileId);

      invariant(tempFile, {
        code: 'NOT_FOUND',
        message: 'Temporary file not found'
      });

      const settings = await getSettings();

      invariant(tempFile.size <= settings.storageMaxBannerSize, {
        code: 'BAD_REQUEST',
        message: `Banner file exceeds the configured maximum size of ${settings.storageMaxBannerSize / (1024 * 1024)} MB`
      });

      const newFile = await fileManager.saveFile(input.fileId, ctx.userId);

      newBannerId = newFile.id;
    }

    await db
      .update(users)
      .set({ bannerId: newBannerId })
      .where(eq(users.id, ctx.userId));

    if (user.bannerId) {
      await removeFile(user.bannerId);
    }

    void publishUser(ctx.userId, 'update');
  });

export { changeBannerRoute };
