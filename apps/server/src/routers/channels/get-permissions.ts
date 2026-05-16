import { Permission } from '@caesar/shared';
import {
  channelRolePermissions,
  channelUserPermissions
} from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { isDirectMessageChannel } from '@server/db/queries/dms';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const getPermissionsRoute = protectedProcedure
  .input(
    z.object({
      channelId: z.number()
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_CHANNEL_PERMISSIONS);

    const isDmChannel = await isDirectMessageChannel(input.channelId);

    invariant(!isDmChannel, {
      code: 'FORBIDDEN',
      message: 'Cannot view DM channel permissions'
    });

    const [rolePermissions, userPermissions] = await Promise.all([
      db
        .select()
        .from(channelRolePermissions)
        .where(eq(channelRolePermissions.channelId, input.channelId)),
      db
        .select()
        .from(channelUserPermissions)
        .where(eq(channelUserPermissions.channelId, input.channelId))
    ]);

    return {
      rolePermissions,
      userPermissions
    };
  });

export { getPermissionsRoute };
