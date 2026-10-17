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
  desc,
  eq,
  getTableColumns,
  notExists,
  sql,
  type SQL
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '..';
import {
  fileByIdJson,
  fileJson,
  jsonArrayOf,
  jsonObject,
  jsonOneOf,
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

const getJoinedMessages = async (
  channel: TChannelAccess,
  query: {
    where: SQL | undefined;
    orderBy: SQL;
    limit?: number;
  }
): Promise<TJoinedMessage[]> => {
  const rows = await db.all<{ message: string }>(
    sql`SELECT ${joinedMessageJson} AS message FROM ${messages}
      WHERE ${query.where ?? sql`1`}
      ORDER BY ${query.orderBy}
      ${query.limit === undefined ? sql`` : sql`LIMIT ${query.limit}`}`
  );

  return withFileTokens(
    rows.map((row) => parseJson<TJoinedMessage>(row.message)),
    channel
  );
};

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

const getMessage = async (
  messageId: number
): Promise<TJoinedMessage | undefined> => {
  const row = await db.get<
    { message: string; private: number; fileAccessToken: string } | undefined
  >(
    sql`SELECT ${joinedMessageJson} AS message,
        ${channels.private} AS private,
        ${channels.fileAccessToken} AS fileAccessToken
      FROM ${messages}
      INNER JOIN ${channels} ON ${channels.id} = ${messages.channelId}
      WHERE ${messages.id} = ${messageId}`
  );

  if (!row) return undefined;

  const [message] = withFileTokens([parseJson(row.message)], {
    private: Boolean(row.private),
    fileAccessToken: row.fileAccessToken
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
