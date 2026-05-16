import { db } from '@server/db';
import { removeFile } from '@server/db/mutations/files';
import { publishUser } from '@server/db/publishers';
import { getSettings } from '@server/db/queries/server';
import { getUserById } from '@server/db/queries/users';
import { users } from '@server/db/schema';
import { fileManager } from '@server/utils/file-manager';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import z from 'zod';

const changeBannerRoute = protectedProcedure
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

    if (user.bannerId) {
      await removeFile(user.bannerId);

      await db
        .update(users)
        .set({ bannerId: null })
        .where(eq(users.id, ctx.userId));
    }

    if (input.fileId) {
      const tempFile = await fileManager.getTemporaryFile(input.fileId);

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

      await db
        .update(users)
        .set({ bannerId: newFile.id })
        .where(eq(users.id, ctx.userId));
    }

    publishUser(ctx.userId, 'update');
  });

export { changeBannerRoute };
