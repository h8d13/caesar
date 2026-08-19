import { DEFAULT_MESSAGES_LIMIT } from '@caesar/shared';
import { messages } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import {
  joinMessagesWithRelations,
  messageColumns,
  type TMessageRow
} from '@server/db/queries/messages';
import { assertChannelAccess } from '@server/helpers/assert-channel-access';
import { invariant } from '@server/utils/invariant';
import { protectedProcedure } from '@server/utils/trpc';
import { and, asc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';

const getThreadMessagesRoute = protectedProcedure
  .input(
    z.object({
      parentMessageId: z.number(),
      cursor: z.number().nullish(),
      limit: z.number().default(DEFAULT_MESSAGES_LIMIT)
    })
  )
  .meta({ infinite: true })
  .query(async ({ ctx, input }) => {
    const { parentMessageId, cursor, limit } = input;

    const parentMessage = await db
      .select({
        channelId: messages.channelId,
        parentMessageId: messages.parentMessageId
      })
      .from(messages)
      .where(eq(messages.id, parentMessageId))
      .limit(1)
      .get();

    invariant(parentMessage, {
      code: 'NOT_FOUND',
      message: 'Parent message not found'
    });

    invariant(!parentMessage.parentMessageId, {
      code: 'BAD_REQUEST',
      message: 'Cannot get thread for a reply message'
    });

    const channel = await assertChannelAccess(ctx, parentMessage.channelId);

    invariant(channel, {
      code: 'NOT_FOUND',
      message: 'Channel not found'
    });

    const rows: TMessageRow[] = await db
      .select(messageColumns)
      .from(messages)
      .where(
        cursor
          ? and(
              eq(messages.parentMessageId, parentMessageId),
              gt(messages.createdAt, cursor)
            )
          : eq(messages.parentMessageId, parentMessageId)
      )
      .orderBy(asc(messages.createdAt))
      .limit(limit + 1);

    let nextCursor: number | null = null;

    if (rows.length > limit) {
      const next = rows.pop();

      nextCursor = next ? next.createdAt : null;
    }

    if (rows.length === 0) {
      return { messages: [], nextCursor };
    }

    const messagesWithRelations = await joinMessagesWithRelations(
      rows,
      channel
    );

    return { messages: messagesWithRelations, nextCursor };
  });

export { getThreadMessagesRoute };
