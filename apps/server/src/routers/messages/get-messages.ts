import {
  DEFAULT_MESSAGES_LIMIT,
  ServerEvents,
  type TChannelAccess,
  type TJoinedMessage
} from '@caesar/shared';
import { channelReadStates, messages } from '@caesar/shared/db/schema';
import { config } from '@server/config';
import { db } from '@server/db';
import { getUnreadCounts } from '@server/db/queries/channels';
import { getJoinedMessages } from '@server/db/queries/messages';
import { assertChannelAccess } from '@server/helpers/assert-channel-access';
import { invariant } from '@server/utils/invariant';
import { pubsub } from '@server/utils/pubsub';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

type TPageQuery =
  | { by: 'latest' }
  | { by: 'before' | 'from' | 'after'; createdAt: number };

// One page walking away from a createdAt bound, returned newest first like
// every response. The probe row only says whether more exist: the cursor is
// the last row kept, so the next strict lt/gt page starts right after it.
const getPage = async (
  channel: TChannelAccess,
  channelId: number,
  query: TPageQuery,
  size: number
) => {
  const rows = await getJoinedMessages(channel, {
    ...query,
    channelId,
    limit: size + 1
  });
  const newestFirst = query.by === 'latest' || query.by === 'before';
  const more = rows.length > size;

  if (more) rows.pop();

  return {
    rows: newestFirst ? rows : rows.reverse(),
    // size >= 1, so a page with more rows always kept one
    cursor: more ? rows.at(newestFirst ? -1 : 0)!.createdAt : null
  };
};

const getMessagesRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.getMessages.maxRequests,
  windowMs: config.rateLimiters.getMessages.windowMs,
  logLabel: 'getMessages'
})
  .input(
    z.object({
      channelId: z.number(),
      cursor: z.number().nullish(),
      // forward cursor: the newerCursor of a previous response
      newerCursor: z.number().nullish(),
      targetMessageId: z.number().nullish(),
      limit: z
        .number()
        .int()
        .min(1)
        .max(DEFAULT_MESSAGES_LIMIT)
        .default(DEFAULT_MESSAGES_LIMIT)
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

    const page = (query: TPageQuery, size: number) =>
      getPage(channel, channelId, query, size);

    let rows: TJoinedMessage[];
    let nextCursor: number | null = null;
    // null once the response reaches the channel's newest message
    let newerCursor: number | null = null;

    if (targetMessageId) {
      const targetMessage = await db
        .select({
          id: messages.id,
          createdAt: messages.createdAt
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

      // A window of about one page around the target (limit / 2 older, the
      // target, limit / 2 newer); the client pages out of it with both
      // cursors instead of loading everything up to the live tail. At least
      // one row per side so both cursors exist even at limit 1.
      const half = Math.max(1, Math.floor(limit / 2));
      const { createdAt } = targetMessage;
      const older = await page({ by: 'before', createdAt }, half);
      const newer = await page({ by: 'from', createdAt }, half + 1);

      rows = [...newer.rows, ...older.rows];
      nextCursor = older.cursor;
      newerCursor = newer.cursor;
    } else if (input.newerCursor) {
      // forward page toward the live tail; nextCursor stays null, the client
      // keeps the older cursor it already has
      const newer = await page(
        { by: 'after', createdAt: input.newerCursor },
        limit
      );

      rows = newer.rows;
      newerCursor = newer.cursor;
    } else {
      const older = await page(
        cursor ? { by: 'before', createdAt: cursor } : { by: 'latest' },
        limit
      );

      rows = older.rows;
      nextCursor = older.cursor;
    }

    if (rows.length === 0) {
      return { messages: [], nextCursor, newerCursor };
    }

    // Opening the channel, or jumping into it, marks it read up to its
    // newest message. Older and newer pages skip that write: the channel was
    // marked when opened, and live messages mark themselves through
    // channels.markAsRead on the client.
    if (cursor || input.newerCursor) {
      return { messages: rows, nextCursor, newerCursor };
    }

    // Rows come newest first, so a batch that reaches the tail has the
    // newest message in rows[0]; a jump window short of the tail looks it up
    // by id, matching the comparison the unread count makes.
    let latestMessageId: number | undefined = rows[0]?.id;

    if (newerCursor !== null) {
      const latestMessage = await db
        .select({ id: messages.id })
        .from(messages)
        .where(eq(messages.channelId, channelId))
        .orderBy(desc(messages.id))
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

      // assertChannelAccess above already cleared the channel
      const updatedReadStates = await getUnreadCounts(ctx.userId, [channelId]);

      pubsub.publishFor(ctx.userId, ServerEvents.CHANNEL_READ_STATES_UPDATE, {
        channelId,
        count: updatedReadStates[channelId] ?? 0
      });
    }

    return { messages: rows, nextCursor, newerCursor };
  });

export { getMessagesRoute };
