import { ChannelPermission, type TChannelAccess } from '@caesar/shared';
import { channels } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { assertDmChannel } from '@server/db/queries/dms';
import type { Context } from '@server/utils/trpc';
import { eq } from 'drizzle-orm';

// Both checks below need the same channel row, and callers usually need it
// again afterwards (fileAccessToken for attachment tokens). Read it once here
// and hand it to everyone; the row is returned so the caller does not issue a
// third identical select.
//
// The DM check runs before the permission check rather than alongside it: on
// a DM channel it establishes participation, which is exactly what the
// permission check would otherwise re-query. Non-DM channels short-circuit
// without a query, so nothing is serialized for them.
//
// Returns undefined for a missing channel rather than throwing: the
// permission check already rejects that as FORBIDDEN, and changing it to
// NOT_FOUND would alter the error every caller surfaces today.
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
