import { Permission } from '@caesar/shared';
import { getInviteTree } from '@server/db/queries/invite-tree';
import { clearFields } from '@server/helpers/clear-fields';
import { protectedProcedure } from '@server/utils/trpc';
import z from 'zod';

// Invite provenance for moderation: 'up' answers "who vouched for X",
// 'down' lists everyone that came in through X's branch. Inviter links
// carry no ip/geo, so MANAGE_USERS is enough. identity keeps its usual
// gate.
const getInviteTreeRoute = protectedProcedure
  .input(
    z.object({
      userId: z.number(),
      direction: z.enum(['up', 'down']),
      maxDepth: z.number().int().min(1).max(32).default(8)
    })
  )
  .query(async ({ ctx, input }) => {
    await ctx.needsPermission(Permission.MANAGE_USERS);

    const nodes = await getInviteTree(
      input.userId,
      input.direction,
      input.maxDepth
    );

    if (await ctx.hasPermission(Permission.VIEW_USER_SENSITIVE_DATA)) {
      return nodes;
    }

    return clearFields(nodes, ['identity']);
  });

export { getInviteTreeRoute };
