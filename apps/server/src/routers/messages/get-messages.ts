import { DEFAULT_MESSAGES_LIMIT, ServerEvents } from '@caesar/shared';
import { channelReadStates, messages } from '@caesar/shared/db/schema';
import { config } from '@server/config';
import { db } from '@server/db';
import { getChannelsReadStatesForUser } from '@server/db/queries/channels';
import {
  joinMessagesWithRelations,
  messageColumns,
  type TMessageRow
} from '@server/db/queries/messages';
import { assertChannelAccess } from '@server/helpers/assert-channel-access';
import { invariant } from '@server/utils/invariant';
import { pubsub } from '@server/utils/pubsub';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { and, count, desc, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';

const getMessagesRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.getMessages.maxRequests,
  windowMs: config.rateLimiters.getMessages.windowMs,
  logLabel: 'getMessages'
})
  .input(
    z.object({
      channelId: z.number(),
      cursor: z.number().nullish(),
      targetMessageId: z.number().nullish(),
      limit: z.number().default(DEFAULT_MESSAGES_LIMIT)
    })
  )
  .meta({ infinite: true })
  .query(async ({ ctx, input }) => {
    // Returns the row the access checks already read, so the private /
    // fileAccessToken lookup below does not repeat it.
    const channel = await assertChannelAccess(ctx, input.channelId);

    const { channelId, cursor, limit, targetMessageId } = input;

    invariant(channel, {
      code: 'NOT_FOUND',
      message: 'Channel not found'
    });

    const baseWhere = and(
      eq(messages.channelId, channelId),
      isNull(messages.parentMessageId)
    );

    let rows: TMessageRow[];
    let nextCursor: number | null = null;

    if (targetMessageId) {
      // fetch all messages from newest down to (and including) the target
      const targetMessage = await db
        .select({
          id: messages.id,
          createdAt: messages.createdAt,
          parentMessageId: messages.parentMessageId
        })
        .from(messages)
        .where(
          and(
            eq(messages.id, targetMessageId),
            eq(messages.channelId, channelId)
          )
        )
        .get();

      invariant(targetMessage, {
        code: 'NOT_FOUND',
        message: 'Target message not found'
      });

      invariant(!targetMessage.parentMessageId, {
        code: 'BAD_REQUEST',
        message: 'Target message must be a root message'
      });

      // fetch everything from newest down to the target, plus 20 older messages
      // for context around the target
      const olderMessages = await db
        .select(messageColumns)
        .from(messages)
        .where(and(baseWhere, lt(messages.createdAt, targetMessage.createdAt)))
        .orderBy(desc(messages.createdAt))
        .limit(20);

      const newerMessages = await db
        .select(messageColumns)
        .from(messages)
        .where(and(baseWhere, gte(messages.createdAt, targetMessage.createdAt)))
        .orderBy(desc(messages.createdAt));

      rows = [...newerMessages, ...olderMessages];
    } else {
      // standard cursor-based pagination
      rows = await db
        .select(messageColumns)
        .from(messages)
        .where(
          cursor ? and(baseWhere, lt(messages.createdAt, cursor)) : baseWhere
        )
        .orderBy(desc(messages.createdAt))
        .limit(limit + 1);

      if (rows.length > limit) {
        const next = rows.pop();

        nextCursor = next ? next.createdAt : null;
      }
    }

    if (rows.length === 0) {
      return { messages: [], nextCursor };
    }

    const messagesWithRelations = await joinMessagesWithRelations(
      rows,
      channel
    );

    const messageIds = rows.map((m) => m.id);
    const replies = alias(messages, 'replies');

    const replyCountRows = await db
      .select({
        parentMessageId: replies.parentMessageId,
        count: count()
      })
      .from(replies)
      .where(inArray(replies.parentMessageId, messageIds))
      .groupBy(replies.parentMessageId);

    const replyCountByMessage = replyCountRows.reduce<Record<number, number>>(
      (acc, r) => {
        if (r.parentMessageId !== null) {
          acc[r.parentMessageId] = r.count;
        }
        return acc;
      },
      {}
    );

    const messagesWithReplyCounts = messagesWithRelations.map((msg) => ({
      ...msg,
      replyCount: replyCountByMessage[msg.id] ?? 0
    }));

    // Read state tracks the channel's newest message rather than the newest
    // in this batch, so scrolling back through history does not mark the
    // channel unread. Both query branches order by createdAt desc, so on a
    // first page rows[0] already is that message -- only a cursor page has
    // to look it up, and then only for the id.
    let latestMessageId: number | undefined = rows[0]?.id;

    if (cursor) {
      const latestMessage = await db
        .select({ id: messages.id })
        .from(messages)
        .where(baseWhere)
        .orderBy(desc(messages.createdAt))
        .limit(1)
        .get();

      latestMessageId = latestMessage?.id;
    }

    if (latestMessageId) {
      const readAt = Date.now();

      await db
        .insert(channelReadStates)
        .values({
          channelId,
          userId: ctx.userId,
          lastReadMessageId: latestMessageId,
          lastReadAt: readAt
        })
        .onConflictDoUpdate({
          target: [channelReadStates.channelId, channelReadStates.userId],
          set: {
            lastReadMessageId: latestMessageId,
            lastReadAt: readAt
          }
        });

      const updatedReadStates = await getChannelsReadStatesForUser(
        ctx.userId,
        channelId
      );

      pubsub.publishFor(ctx.userId, ServerEvents.CHANNEL_READ_STATES_UPDATE, {
        channelId,
        count: updatedReadStates[channelId] ?? 0
      });
    }

    return { messages: messagesWithReplyCounts, nextCursor };
  });

export { getMessagesRoute };
