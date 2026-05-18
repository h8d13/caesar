import { ChannelPermission, ChannelType } from '@caesar/shared';
import { channels, messages } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { protectedProcedure } from '@server/utils/trpc';
import { and, desc, eq, inArray, isNull, like, or } from 'drizzle-orm';
import { z } from 'zod';

const searchMessagesRoute = protectedProcedure
  .input(
    z.object({
      query: z.string().min(1).max(200),
      limit: z.number().default(25),
      // when set, restricts the search to a single channel (DM or text).
      // permission is still verified per-channel via hasChannelPermission.
      channelId: z.number().optional()
    })
  )
  .query(async ({ ctx, input }) => {
    const { query, limit, channelId } = input;

    // determine which channels to search
    let candidates: { id: number; isDm: boolean | null }[];

    // DMs are stored as ChannelType.VOICE with `isDm=true` (the same channel
    // also hosts the optional voice call), so the message-bearing channels
    // are the union of TEXT channels and DMs.
    if (channelId !== undefined) {
      const channel = await db
        .select({ id: channels.id, type: channels.type, isDm: channels.isDm })
        .from(channels)
        .where(eq(channels.id, channelId))
        .get();

      if (!channel) return [];
      if (channel.type !== ChannelType.TEXT && !channel.isDm) return [];

      candidates = [{ id: channel.id, isDm: channel.isDm }];
    } else {
      candidates = await db
        .select({ id: channels.id, isDm: channels.isDm })
        .from(channels)
        .where(
          or(eq(channels.type, ChannelType.TEXT), eq(channels.isDm, true))
        );
    }

    // filter to channels the user can view (DM participation is handled
    // inside hasChannelPermission)
    const accessibleIds: number[] = [];
    const isDmByChannelId = new Map<number, boolean>();

    for (const channel of candidates) {
      const canView = await ctx.hasChannelPermission(
        channel.id,
        ChannelPermission.VIEW_CHANNEL
      );

      if (canView) {
        accessibleIds.push(channel.id);
        isDmByChannelId.set(channel.id, channel.isDm === true);
      }
    }

    if (accessibleIds.length === 0) {
      return [];
    }

    const rows = await db
      .select({
        id: messages.id,
        content: messages.content,
        channelId: messages.channelId,
        userId: messages.userId,
        createdAt: messages.createdAt
      })
      .from(messages)
      .where(
        and(
          inArray(messages.channelId, accessibleIds),
          like(messages.content, `%${query}%`),
          isNull(messages.parentMessageId)
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      ...row,
      isDm: isDmByChannelId.get(row.channelId) ?? false
    }));
  });

export { searchMessagesRoute };
