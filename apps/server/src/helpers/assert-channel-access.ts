import { ChannelPermission } from '@caesar/shared';
import { assertDmChannel } from '@server/db/queries/dms';
import type { Context } from '@server/utils/trpc';

const assertChannelAccess = async (
  ctx: Context,
  channelId: number
): Promise<void> => {
  await Promise.all([
    assertDmChannel(channelId, ctx.userId),
    ctx.needsChannelPermission(channelId, ChannelPermission.VIEW_CHANNEL)
  ]);
};

export { assertChannelAccess };
