import { Permission } from '@caesar/shared';
import { getInviteTree } from '@server/db/queries/invite-tree';
import { protectedProcedure } from '@server/utils/trpc';
import z from 'zod';

// Invite provenance for moderation: 'up' answers "who vouched for X",
// 'down' lists everyone that came in through X's branch. Inviter links
// carry no ip/geo, so MANAGE_USERS is enough. identity and invite codes
// keep their usual gates: a code may still be live.
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

    const [nodes, canViewSensitive, canViewCodes] = await Promise.all([
      getInviteTree(input.userId, input.direction, input.maxDepth),
      ctx.hasPermission(Permission.VIEW_USER_SENSITIVE_DATA),
      ctx.hasPermission(Permission.MANAGE_INVITES)
    ]);

    return nodes.map((node) => ({
      ...node,
      identity: canViewSensitive ? node.identity : null,
      inviteCode: canViewCodes ? node.inviteCode : null
    }));
  });

export { getInviteTreeRoute };
