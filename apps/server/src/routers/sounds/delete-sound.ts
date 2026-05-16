import { ActivityLogType, Permission } from '@caesar/shared';
import { sounds } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { removeFile } from '@server/db/mutations/files';
import { publishSound } from '@server/db/publishers';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const deleteSoundRoute = protectedProcedure
  .input(
    z.object({
      soundId: z.number()
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_SOUNDS);

    const removedSound = await db
      .delete(sounds)
      .where(eq(sounds.id, input.soundId))
      .returning()
      .get();

    invariant(removedSound, {
      code: 'NOT_FOUND',
      message: 'Sound not found'
    });

    await removeFile(removedSound.fileId);

    publishSound(removedSound.id, 'delete');
    enqueueActivityLog({
      type: ActivityLogType.DELETED_SOUND,
      userId: ctx.user.id,
      details: {
        name: removedSound.name
      }
    });
  });

export { deleteSoundRoute };
