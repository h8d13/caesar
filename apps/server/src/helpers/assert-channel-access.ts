import { ChannelPermission, type TChannelAccess } from '@caesar/shared';
import { getChannelAccessRow } from '@server/db/queries/channels';
import { assertDmChannel } from '@server/db/queries/dms';
import type { Context } from '@server/utils/trpc';

// Reads the channel row once and hands it to both checks, then returns it so
// callers (which need fileAccessToken) do not select it again.
//
// The DM check runs first because on a DM it establishes participation, which
// is what the permission check would otherwise re-query. Non-DM channels
// short-circuit without a query.
//
// Missing channel returns undefined rather than throwing: the permission
// check already rejects it as FORBIDDEN, and NOT_FOUND here would change the
// error every caller surfaces.
const assertChannelAccess = async (
  ctx: Context,
  channelId: number,
  permission = ChannelPermission.VIEW_CHANNEL
): Promise<TChannelAccess | undefined> => {
  const channel = await getChannelAccessRow(channelId);

  const isDmParticipant = await assertDmChannel(
    channelId,
    ctx.userId,
    channel?.isDm ?? false
  );

  await ctx.needsChannelPermission(channelId, permission, {
    channel,
    isDmParticipant
  });

  return channel;
};

export { assertChannelAccess };
