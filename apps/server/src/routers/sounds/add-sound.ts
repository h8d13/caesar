import { ActivityLogType, Permission } from '@caesar/shared';
import { sounds } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { publishSound } from '@server/db/publishers';
import { getUniqueSoundName } from '@server/db/queries/sounds';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { fileManager } from '@server/utils/file-manager';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { z } from 'zod';

const addSoundRoute = protectedProcedure
  .input(
    z
      .array(
        z.object({
          fileId: z.string(),
          name: z.string().min(1).max(32)
        })
      )
      .max(50)
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_SOUNDS);

    for (const data of input) {
      invariant(fileManager.temporaryFileHasMimeType(data.fileId, 'audio/'), {
        code: 'BAD_REQUEST',
        message: 'Invalid file type. Sounds must be audio files.'
      });
    }

    for (const data of input) {
      const newFile = await fileManager.saveFile(data.fileId, ctx.userId);
      const uniqueSoundName = await getUniqueSoundName(data.name);

      const sound = await db
        .insert(sounds)
        .values({
          name: uniqueSoundName,
          fileId: newFile.id,
          userId: ctx.userId,
          createdAt: Date.now()
        })
        .returning()
        .get();

      void publishSound(sound.id, 'create');
      enqueueActivityLog({
        type: ActivityLogType.CREATED_SOUND,
        userId: ctx.user.id,
        details: {
          name: sound.name
        }
      });
    }
  });

export { addSoundRoute };
