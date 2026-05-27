import { getActiveStatusImagesByUserId } from '@server/db/queries/status-images';
import { protectedProcedure } from '@server/utils/trpc';
import z from 'zod';

// Active stories for one user, fetched lazily when a viewer opens. The ring
// itself is driven by activeStatusCount on the public user, so this only runs
// on demand.
const getStatusImagesRoute = protectedProcedure
  .input(
    z.object({
      userId: z.number()
    })
  )
  .query(({ input }) => {
    return getActiveStatusImagesByUserId(input.userId);
  });

export { getStatusImagesRoute };
