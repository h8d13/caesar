import { Permission } from '@caesar/shared';
import { getInvites } from '@server/db/queries/invites';
import { protectedProcedure } from '@server/utils/trpc';

const getInvitesRoute = protectedProcedure.query(async ({ ctx }) => {
  await ctx.needsPermission(Permission.MANAGE_INVITES);

  const invites = await getInvites();

  return invites;
});

export { getInvitesRoute };
