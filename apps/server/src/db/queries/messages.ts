import type {
  TJoinedMessage,
  TMessage,
  TMessageReaction
} from '@caesar/shared';
import {
  channels,
  directMessages,
  files,
  messageFiles,
  messageReactions,
  messages,
  socialCreditLedger
} from '@caesar/shared/db/schema';
import { generateFileToken } from '@server/helpers/files-crypto';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  lt,
  notExists,
  type SQL,
  sql
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '..';
import { prepared } from '../prepared';
import {
  fileByIdJson,
  fileJson,
  jsonArrayOf,
  jsonObject,
  jsonOneOf,
  jsonRows,
  parseJson,
  precompile
} from './json-sql';

type TChannelAccess = { private: boolean; fileAccessToken: string };

// Wire columns: TJoinedMessage omits these two, so a new column ships
// without touching this file. replyToMessageId only resolves `replyTo`.
const {
  updatedAt: _updatedAt,
  replyToMessageId: _replyToMessageId,
  ...messageWireColumns
} = getTableColumns(messages);

const replyTo = alias(messages, 'reply_to');

const messageRelationsJson = {
  files: jsonArrayOf(
    fileJson(files),
    sql`FROM ${messageFiles}
      INNER JOIN ${files} ON ${files.id} = ${messageFiles.fileId}
      WHERE ${messageFiles.messageId} = ${messages.id}`
  ),
  reactions: jsonArrayOf(
    jsonObject({
      messageId: messageReactions.messageId,
      userId: messageReactions.userId,
      emoji: messageReactions.emoji,
      createdAt: messageReactions.createdAt,
      fileId: messageReactions.fileId,
      file: fileByIdJson('reaction_file', messageReactions.fileId)
    }),
    sql`FROM ${messageReactions}
      WHERE ${messageReactions.messageId} = ${messages.id}`
  ),
  scVotes: jsonArrayOf(
    jsonObject({
      voterId: socialCreditLedger.voterId,
      value: socialCreditLedger.amount
    }),
    sql`FROM ${socialCreditLedger}
      WHERE ${socialCreditLedger.ledgerableType} = 'message_vote'
        AND ${socialCreditLedger.ledgerableId} = ${messages.id}
        AND ${socialCreditLedger.voterId} IS NOT NULL`
  ),
  replyTo: jsonOneOf(
    jsonObject({
      id: replyTo.id,
      content: replyTo.content,
      userId: replyTo.userId,
      expiresAt: replyTo.expiresAt
    }),
    sql`FROM ${messages} AS ${sql.identifier('reply_to')}
      WHERE ${replyTo.id} = ${messages.replyToMessageId}`
  )
};

const joinedMessageJson = precompile(
  jsonObject({
    ...messageWireColumns,
    ...messageRelationsJson
  })
);

// File tokens are an HMAC over the server secret, so SQL cannot mint them.
// Only message attachments carry one; custom emoji files are public.
const withFileTokens = (
  joined: TJoinedMessage[],
  channel: TChannelAccess
): TJoinedMessage[] => {
  if (!channel.private) return joined;

  for (const message of joined) {
    for (const file of message.files) {
      file._accessToken = generateFileToken(file.id, channel.fileAccessToken);
    }
  }

  return joined;
};

// Fixed variants instead of a caller-built WHERE: prepared, a page skips
// drizzle's per-call SQL build (~12% of a 51-message page).
const joinedMessagesQuery = (where: SQL | undefined, forward = false) =>
  prepared(() =>
    db
      .select({ message: sql`${joinedMessageJson}` })
      .from(messages)
      .where(where)
      .orderBy(forward ? asc(messages.createdAt) : desc(messages.createdAt))
      .limit(sql.placeholder('limit'))
  );

const inChannel = eq(messages.channelId, sql.placeholder('channelId'));

const joinedMessagesQueries = {
  latest: joinedMessagesQuery(inChannel),
  before: joinedMessagesQuery(
    and(inChannel, lt(messages.createdAt, sql.placeholder('createdAt')))
  ),
  from: joinedMessagesQuery(
    and(inChannel, gte(messages.createdAt, sql.placeholder('createdAt'))),
    true
  ),
  after: joinedMessagesQuery(
    and(inChannel, gt(messages.createdAt, sql.placeholder('createdAt'))),
    true
  ),
  pinned: joinedMessagesQuery(and(inChannel, eq(messages.pinned, true)))
};

// a negative LIMIT is no limit in SQLite, so one query serves both
const NO_LIMIT = -1;

// newest first, except `from` / `after` (createdAt >= / >), which walk
// forward oldest first so a limit keeps the rows nearest the bound
const getJoinedMessages = async (
  channel: TChannelAccess,
  query:
    | { by: 'latest' | 'pinned'; channelId: number; limit?: number }
    | {
        by: 'before' | 'from' | 'after';
        channelId: number;
        createdAt: number;
        limit?: number;
      }
): Promise<TJoinedMessage[]> =>
  withFileTokens(
    await jsonRows<TJoinedMessage>(joinedMessagesQueries[query.by](), {
      ...query,
      limit: query.limit ?? NO_LIMIT
    }),
    channel
  );

const getMessageByFileId = async (
  fileId: number
): Promise<TMessage | undefined> => {
  const row = await db
    .select({ message: messages })
    .from(messageFiles)
    .innerJoin(messages, eq(messages.id, messageFiles.messageId))
    .where(eq(messageFiles.fileId, fileId))
    .get();

  return row?.message;
};

const messageByIdQuery = prepared(() =>
  db
    .select({
      message: sql`${joinedMessageJson}`,
      private: channels.private,
      fileAccessToken: channels.fileAccessToken
    })
    .from(messages)
    .innerJoin(channels, eq(channels.id, messages.channelId))
    .where(eq(messages.id, sql.placeholder('id')))
);

const getMessage = async (
  messageId: number
): Promise<TJoinedMessage | undefined> => {
  // raw columns through values(), see jsonRows
  const [row] = await messageByIdQuery().values({ id: messageId });

  if (!row) return undefined;

  // libsql rows are array-like, not iterable: index, do not destructure
  const [message] = withFileTokens([parseJson(row[0])], {
    private: Boolean(row[1]),
    fileAccessToken: row[2] as string
  });

  return message;
};

const getNonDirectMessagesFromUserId = async (
  userId: number
): Promise<TMessage[]> =>
  db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.userId, userId),
        notExists(
          db
            .select()
            .from(directMessages)
            .where(eq(directMessages.channelId, messages.channelId))
        )
      )
    )
    .orderBy(desc(messages.createdAt));

const getReaction = async (
  messageId: number,
  emoji: string,
  userId: number
): Promise<TMessageReaction | undefined> =>
  db
    .select()
    .from(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.emoji, emoji),
        eq(messageReactions.userId, userId)
      )
    )
    .get();

export {
  getJoinedMessages,
  getMessage,
  getMessageByFileId,
  getNonDirectMessagesFromUserId,
  getReaction
};
