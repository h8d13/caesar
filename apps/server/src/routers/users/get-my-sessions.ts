import { sha256 } from '@caesar/shared';
import { getLastLogins } from '@server/db/queries/logins';
import { protectedProcedure } from '@server/utils/trpc';
import z from 'zod';

const getMySessionsRoute = protectedProcedure
  .input(z.void())
  .query(async ({ ctx }) => {
    const rows = await getLastLogins(ctx.userId, 10);

    // Each login becomes a stable, opaque 8-char fingerprint of the
    // userAgent (groups same-browser sessions together) plus its time.
    // We deliberately don't expose ip or full UA back to the user; the
    // hash is enough for "is this me?" recognition.
    return Promise.all(
      rows.map(async (row) => ({
        hash: (await sha256(row.userAgent ?? '')).slice(0, 8),
        createdAt: row.createdAt
      }))
    );
  });

export { getMySessionsRoute };
