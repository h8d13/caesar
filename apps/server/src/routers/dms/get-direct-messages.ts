import { Permission } from '@caesar/shared';
import { getDirectMessageConversations } from '@server/db/queries/dms';
import { getSettings } from '@server/db/queries/server';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { z } from 'zod';

const getDirectMessagesRoute = protectedProcedure
  .input(z.void())
  .query(async ({ ctx }) => {
    const settings = await getSettings();

    invariant(settings.directMessagesEnabled, {
      code: 'FORBIDDEN',
      message: 'Direct messages are disabled on this server'
    });

    invariant(await ctx.hasPermission(Permission.USE_DMS), {
      code: 'FORBIDDEN',
      message: 'You do not have permission to use direct messages'
    });

    return getDirectMessageConversations(ctx.userId);
  });

export { getDirectMessagesRoute };
