import { ChannelPermission, ChannelType } from '@caesar/shared';
import { channels, messages } from '@caesar/shared/db/schema';
import { config } from '@server/config';
import { db } from '@server/db';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';

const GLOB_SPECIAL_CHARS = new Set(['*', '?', '[']);

// SQLite LIKE only folds ASCII case, so build a GLOB with a [xX] class per
// cased char instead (é matches É). Bracketing the glob specials keeps the
// query literal.
const buildCaseInsensitiveGlob = (value: string) => {
  let pattern = '';

  for (const char of value) {
    const lower = char.toLowerCase();
    const upper = char.toUpperCase();
    // skip folds that change length (ß -> SS): a class matches one char
    const isCased =
      lower !== upper && [...lower].length === 1 && [...upper].length === 1;

    if (isCased) {
      pattern += `[${lower}${upper}]`;
    } else if (GLOB_SPECIAL_CHARS.has(char)) {
      pattern += `[${char}]`;
    } else {
      pattern += char;
    }
  }

  return `*${pattern}*`;
};

const searchMessagesRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.searchMessages.maxRequests,
  windowMs: config.rateLimiters.searchMessages.windowMs,
  logLabel: 'searchMessages'
})
  .input(
    z.object({
      query: z.string().min(1).max(200),
      limit: z.number().int().min(1).max(50).default(25),
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
          sql`${messages.content} GLOB ${buildCaseInsensitiveGlob(query)}`,
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
