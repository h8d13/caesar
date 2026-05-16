import { z } from 'zod';
import { getDirectMessageConversations } from '@server/db/queries/dms';
import { getSettings } from '@server/db/queries/server';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';

const getDirectMessagesRoute = protectedProcedure
  .input(z.void())
  .query(async ({ ctx }) => {
    const settings = await getSettings();

    invariant(settings.directMessagesEnabled, {
      code: 'FORBIDDEN',
      message: 'Direct messages are disabled on this server'
    });

    return getDirectMessageConversations(ctx.userId);
  });

export { getDirectMessagesRoute };
