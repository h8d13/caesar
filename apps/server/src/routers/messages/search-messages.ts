import { ChannelType } from '@caesar/shared';
import { messages } from '@caesar/shared/db/schema';
import { config } from '@server/config';
import { db } from '@server/db';
import { getChannelsForUser } from '@server/db/queries/channels';
import { protectedProcedure, rateLimitedProcedure } from '@server/utils/trpc';
import { and, desc, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

const GLOB_SPECIAL_CHARS = new Set(['*', '?', '[']);

// a GLOB character class matches exactly one code point
const isSingleCodePoint = (value: string) => {
  const codePoint = value.codePointAt(0);

  return codePoint !== undefined && String.fromCodePoint(codePoint) === value;
};

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
      lower !== upper && isSingleCodePoint(lower) && isSingleCodePoint(upper);

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
      // still limited to the channels the user can view.
      channelId: z.number().optional()
    })
  )
  .query(async ({ ctx, input }) => {
    const { query, limit, channelId } = input;

    // DMs are stored as ChannelType.VOICE with `isDm=true` (the same channel
    // also hosts the optional voice call), so the message-bearing channels
    // are the union of TEXT channels and DMs. getChannelsForUser applies
    // VIEW_CHANNEL (DM participation included) in one batch instead of a
    // permission check per channel on the server.
    const searchable = (await getChannelsForUser(ctx.userId)).filter(
      (c) =>
        (c.type === ChannelType.TEXT || c.isDm) &&
        (channelId === undefined || c.id === channelId)
    );

    if (searchable.length === 0) {
      return [];
    }

    const accessibleIds = searchable.map((c) => c.id);
    const isDmByChannelId = new Map(searchable.map((c) => [c.id, c.isDm]));

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
          // ephemeral DM messages (expiresAt set) hold base64 ciphertext:
          // the server can't search them, and GLOB would match random base64
          isNull(messages.expiresAt),
          sql`${messages.content} GLOB ${buildCaseInsensitiveGlob(query)}`
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
