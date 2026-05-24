import { ServerEvents, type TMessage } from '@caesar/shared';
import { channelReadStates, messages } from '@caesar/shared/db/schema';
import { config } from '@server/config';
import { db } from '@server/db';
import {
  getDirectMessageChannelParticipantIds,
  isDirectMessageChannel
} from '@server/db/queries/dms';
import { assertChannelAccess } from '@server/helpers/assert-channel-access';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

const markAsReadRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.markAsRead.maxRequests,
  windowMs: config.rateLimiters.markAsRead.windowMs,
  logLabel: 'markAsRead'
})
  .input(
    z.object({
      channelId: z.number()
    })
  )
  .mutation(async ({ ctx, input }) => {
    await assertChannelAccess(ctx, input.channelId);

    const { channelId } = input;

    // get the newest root message in the channel (excluding thread replies)
    const newestMessage: TMessage | undefined = await db
      .select()
      .from(messages)
      .where(
        and(eq(messages.channelId, channelId), isNull(messages.parentMessageId))
      )
      .orderBy(desc(messages.createdAt))
      .limit(1)
      .get();

    if (!newestMessage) {
      return;
    }

    const newestId = newestMessage.id;

    const existingState = await db
      .select()
      .from(channelReadStates)
      .where(
        and(
          eq(channelReadStates.channelId, channelId),
          eq(channelReadStates.userId, ctx.userId)
        )
      )
      .get();

    const readAt = Date.now();

    if (existingState) {
      await db
        .update(channelReadStates)
        .set({
          lastReadMessageId: newestId,
          lastReadAt: readAt
        })
        .where(
          and(
            eq(channelReadStates.channelId, channelId),
            eq(channelReadStates.userId, ctx.userId)
          )
        );
    } else {
      await db.insert(channelReadStates).values({
        channelId,
        userId: ctx.userId,
        lastReadMessageId: newestId,
        lastReadAt: readAt
      });
    }

    // DM read receipts: opt-in. when on, push a DM_READ event to the
    // other participant so their UI can mark sent messages as read.
    // suppressed while appearOffline is on: presence is masked to peers,
    // so leaking read activity would defeat the offline mask.
    if (ctx.user.sendDmReadReceipts && !ctx.user.appearOffline) {
      const isDm = await isDirectMessageChannel(channelId);

      if (isDm) {
        const participants =
          await getDirectMessageChannelParticipantIds(channelId);
        const others = participants.filter((id) => id !== ctx.userId);

        if (others.length > 0) {
          ctx.pubsub.publishFor(others, ServerEvents.DM_READ, {
            channelId,
            readerId: ctx.userId,
            lastReadMessageId: newestId,
            readAt
          });
        }
      }
    }
  });

export { markAsReadRoute };
