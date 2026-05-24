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

const changeAvatarRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.changeAvatar.maxRequests,
  windowMs: config.rateLimiters.changeAvatar.windowMs,
  logLabel: 'changeAvatar'
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

    if (user.avatarId) {
      await removeFile(user.avatarId);

      await db
        .update(users)
        .set({ avatarId: null })
        .where(eq(users.id, ctx.userId))
        .run();
    }

    if (input.fileId) {
      const tempFile = await fileManager.getTemporaryFile(input.fileId);

      invariant(tempFile, {
        code: 'NOT_FOUND',
        message: 'Temporary file not found'
      });

      const settings = await getSettings();

      invariant(tempFile.size <= settings.storageMaxAvatarSize, {
        code: 'BAD_REQUEST',
        message: `Avatar file exceeds the configured maximum size of ${settings.storageMaxAvatarSize / (1024 * 1024)} MB`
      });

      const newFile = await fileManager.saveFile(input.fileId, ctx.userId);

      await db
        .update(users)
        .set({ avatarId: newFile.id })
        .where(eq(users.id, ctx.userId))
        .run();
    }

    publishUser(ctx.userId, 'update');
  });

export { changeAvatarRoute };
