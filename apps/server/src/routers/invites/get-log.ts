import { Permission } from '@caesar/shared';
import { getInviteLog } from '@server/db/queries/invites';
import { protectedProcedure } from '@server/utils/trpc';

// created / deleted / used, for tracing who came in through which code
const INVITE_LOG_LIMIT = 500;

const getInviteLogRoute = protectedProcedure.query(async ({ ctx }) => {
  await ctx.needsPermission(Permission.MANAGE_INVITES);

  return getInviteLog(INVITE_LOG_LIMIT);
});

export { getInviteLogRoute };
