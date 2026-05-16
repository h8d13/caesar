import { ActivityLogType, Permission } from '@caesar/shared';
import { z } from 'zod';
import { db } from '../../db';
import { publishSound } from '../../db/publishers';
import { getUniqueSoundName } from '../../db/queries/sounds';
import { sounds } from '../../db/schema';
import { enqueueActivityLog } from '../../queues/activity-log';
import { fileManager } from '../../utils/file-manager';
import { protectedProcedure } from '../../utils/trpc';

const addSoundRoute = protectedProcedure
  .input(
    z.array(
      z.object({
        fileId: z.string(),
        name: z.string().min(1).max(32)
      })
    )
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_SOUNDS);

    for (const data of input) {
      const newFile = await fileManager.saveFile(data.fileId, ctx.userId);
      const uniqueSoundName = await getUniqueSoundName(data.name);

      const sound = db
        .insert(sounds)
        .values({
          name: uniqueSoundName,
          fileId: newFile.id,
          userId: ctx.userId,
          createdAt: Date.now()
        })
        .returning()
        .get();

      publishSound(sound.id, 'create');
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
