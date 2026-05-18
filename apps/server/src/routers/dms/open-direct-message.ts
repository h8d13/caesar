import { ChannelType, Permission, ServerEvents } from '@caesar/shared';
import { channels, directMessages, users } from '@caesar/shared/db/schema';
import { config } from '@server/config';
import { db } from '@server/db';
import { publishChannelPermissions } from '@server/db/publishers';
import { getDirectMessageChannel, normalizePair } from '@server/db/queries/dms';
import { getSettings } from '@server/db/queries/server';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { randomUUIDv7 } from 'bun';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const openDirectMessageRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.openDirectMessage.maxRequests,
  windowMs: config.rateLimiters.openDirectMessage.windowMs,
  logLabel: 'openDirectMessage'
})
  .input(
    z.object({
      userId: z.number()
    })
  )
  .mutation(async ({ ctx, input }) => {
    const settings = await getSettings();

    invariant(settings.directMessagesEnabled, {
      code: 'FORBIDDEN',
      message: 'Direct messages are disabled on this server'
    });

    invariant(await ctx.hasPermission(Permission.USE_DMS), {
      code: 'FORBIDDEN',
      message: 'You do not have permission to use direct messages'
    });

    invariant(input.userId !== ctx.userId, {
      code: 'BAD_REQUEST',
      message: 'Cannot create a direct message with yourself'
    });

    const targetUser = await db
      .select({
        id: users.id,
        banned: users.banned
      })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1)
      .get();

    invariant(targetUser && !targetUser.banned, {
      code: 'NOT_FOUND',
      message: 'User not found'
    });

    const [userOneId, userTwoId] = normalizePair(ctx.userId, input.userId);

    const existing = await getDirectMessageChannel(userOneId, userTwoId);

    if (existing) {
      return { channelId: existing.channelId };
    }

    const now = Date.now();

    const channel = await db.transaction(async (tx) => {
      const newChannel = await tx
        .insert(channels)
        .values({
          type: ChannelType.VOICE, // use voice to allow private calls in the future
          name: `DM - ${ctx.user.id}:${input.userId}`,
          topic: null,
          private: true,
          isDm: true,
          position: 0,
          categoryId: null,
          fileAccessToken: randomUUIDv7(),
          fileAccessTokenUpdatedAt: now,
          createdAt: now
        })
        .returning()
        .get();

      await tx.insert(directMessages).values({
        channelId: newChannel.id,
        userOneId,
        userTwoId,
        createdAt: now
      });

      return newChannel;
    });

    const participants = [userOneId, userTwoId];

    ctx.pubsub.publishFor(participants, ServerEvents.CHANNEL_CREATE, channel);
    ctx.pubsub.publishFor(participants, ServerEvents.DM_CONVERSATION_OPEN, {
      channelId: channel.id
    });

    await publishChannelPermissions(participants);

    return { channelId: channel.id };
  });

export { openDirectMessageRoute };
