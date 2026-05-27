import { statusImages } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { removeFile } from '@server/db/mutations/files';
import { publishUser } from '@server/db/publishers';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import z from 'zod';

const removeStatusImageRoute = protectedProcedure
  .input(
    z.object({
      id: z.number()
    })
  )
  .mutation(async ({ ctx, input }) => {
    const story = await db
      .select()
      .from(statusImages)
      .where(eq(statusImages.id, input.id))
      .get();

    invariant(story, {
      code: 'NOT_FOUND',
      message: 'Status not found'
    });

    invariant(story.userId === ctx.userId, {
      code: 'FORBIDDEN',
      message: 'You can only remove your own status'
    });

    // Drop the row before the file so the FK reference is gone regardless of
    // whether SQLite cascade is enforced; removeFile then reclaims disk + row.
    await db.delete(statusImages).where(eq(statusImages.id, input.id)).run();
    await removeFile(story.fileId);

    publishUser(ctx.userId, 'update');
  });

export { removeStatusImageRoute };
