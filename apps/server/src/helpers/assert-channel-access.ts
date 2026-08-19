import { ChannelPermission, type TChannelAccess } from '@caesar/shared';
import { channels } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { assertDmChannel } from '@server/db/queries/dms';
import type { Context } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';

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
  channelId: number
): Promise<TChannelAccess | undefined> => {
  const channel = await db
    .select({
      private: channels.private,
      isDm: channels.isDm,
      fileAccessToken: channels.fileAccessToken
    })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1)
    .get();

  const isDmParticipant = await assertDmChannel(
    channelId,
    ctx.userId,
    channel?.isDm ?? false
  );

  await ctx.needsChannelPermission(channelId, ChannelPermission.VIEW_CHANNEL, {
    channel,
    isDmParticipant
  });

  return channel;
};

export { assertChannelAccess };
