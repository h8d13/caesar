import { ActivityLogType, Permission } from '@caesar/shared';
import { sounds } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { publishSound } from '@server/db/publishers';
import { getSoundById, soundExists } from '@server/db/queries/sounds';
import { enqueueActivityLog } from '@server/queues/activity-log';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateSoundRoute = protectedProcedure
  .input(
    z.object({
      soundId: z.number().min(1),
      name: z.string().min(1).max(32)
    })
  )
  .mutation(async ({ ctx, input }) => {
    await ctx.needsPermission(Permission.MANAGE_SOUNDS);

    const existingSound = await getSoundById(input.soundId);

    invariant(existingSound, {
      code: 'NOT_FOUND',
      message: 'Sound not found'
    });

    const exists = await soundExists(input.name);

    if (exists) {
      ctx.throwValidationError(
        'name',
        'A sound with this name already exists.'
      );
    }

    const updatedSound = await db
      .update(sounds)
      .set({
        name: input.name,
        updatedAt: Date.now()
      })
      .where(eq(sounds.id, existingSound.id))
      .returning()
      .get();

    publishSound(updatedSound.id, 'update');
    enqueueActivityLog({
      type: ActivityLogType.UPDATED_SOUND,
      userId: ctx.user.id,
      details: {
        fromName: existingSound.name,
        toName: input.name
      }
    });
  });

export { updateSoundRoute };
