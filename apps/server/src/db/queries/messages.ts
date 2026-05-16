import type {
  TFile,
  TJoinedMessage,
  TJoinedMessageReaction,
  TMessage,
  TMessageReaction,
  TMessageScVote
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
import { and, count, desc, eq, inArray, notExists } from 'drizzle-orm';
import { db } from '..';

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
  const message = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1)
    .get();

  if (!message) return undefined;

  const channel = await db
    .select({
      fileAccessToken: channels.fileAccessToken,
      private: channels.private
    })
    .from(channels)
    .where(eq(channels.id, message.channelId))
    .limit(1)
    .get();

  if (!channel) return undefined;

  const fileRows = await db
    .select({
      file: files
    })
    .from(messageFiles)
    .innerJoin(files, eq(messageFiles.fileId, files.id))
    .where(eq(messageFiles.messageId, messageId));

  const filesForMessage: TFile[] = fileRows.map((r) => {
    if (channel.private) {
      return {
        ...r.file,
        _accessToken: generateFileToken(r.file.id, channel.fileAccessToken)
      };
    }

    return r.file;
  });

  const reactionRows = await db
    .select({
      messageId: messageReactions.messageId,
      userId: messageReactions.userId,
      emoji: messageReactions.emoji,
      createdAt: messageReactions.createdAt,
      fileId: messageReactions.fileId,
      file: files
    })
    .from(messageReactions)
    .leftJoin(files, eq(messageReactions.fileId, files.id))
    .where(eq(messageReactions.messageId, messageId));

  const reactions: TJoinedMessageReaction[] = reactionRows.map((r) => ({
    messageId: r.messageId,
    userId: r.userId,
    emoji: r.emoji,
    createdAt: r.createdAt,
    fileId: r.fileId,
    file: r.file
  }));

  const scVoteRows = await db
    .select({
      voterId: socialCreditLedger.voterId,
      amount: socialCreditLedger.amount
    })
    .from(socialCreditLedger)
    .where(
      and(
        eq(socialCreditLedger.ledgerableType, 'message_vote'),
        eq(socialCreditLedger.ledgerableId, messageId)
      )
    );

  const scVotes: TMessageScVote[] = scVoteRows
    .filter((r): r is typeof r & { voterId: number } => r.voterId !== null)
    .map((r) => ({
      voterId: r.voterId,
      value: r.amount
    }));

  let replyCount = 0;

  if (!message.parentMessageId) {
    const replyCountRow = await db
      .select({ count: count() })
      .from(messages)
      .where(eq(messages.parentMessageId, messageId))
      .get();

    replyCount = replyCountRow?.count ?? 0;
  }

  let replyTo: { id: number; content: string | null; userId: number } | null =
    null;

  if (message.replyToMessageId) {
    const replyToRow = await db
      .select({
        id: messages.id,
        content: messages.content,
        userId: messages.userId
      })
      .from(messages)
      .where(eq(messages.id, message.replyToMessageId))
      .limit(1)
      .get();

    replyTo = replyToRow ?? null;
  }

  return {
    ...message,
    files: filesForMessage ?? [],
    reactions: reactions ?? [],
    scVotes,
    replyCount,
    replyTo
  };
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

const joinMessagesWithRelations = async (
  rows: TMessage[],
  channel: {
    private: boolean;
    fileAccessToken: string;
  }
): Promise<TJoinedMessage[]> => {
  if (rows.length === 0) return [];

  const messageIds = rows.map((m) => m.id);

  const [fileRows, reactionRows, scVoteRows] = await Promise.all([
    db
      .select({
        messageId: messageFiles.messageId,
        file: files
      })
      .from(messageFiles)
      .innerJoin(files, eq(messageFiles.fileId, files.id))
      .where(inArray(messageFiles.messageId, messageIds)),
    db
      .select({
        messageId: messageReactions.messageId,
        userId: messageReactions.userId,
        emoji: messageReactions.emoji,
        createdAt: messageReactions.createdAt,
        fileId: messageReactions.fileId,
        file: files
      })
      .from(messageReactions)
      .leftJoin(files, eq(messageReactions.fileId, files.id))
      .where(inArray(messageReactions.messageId, messageIds)),
    db
      .select({
        ledgerableId: socialCreditLedger.ledgerableId,
        voterId: socialCreditLedger.voterId,
        amount: socialCreditLedger.amount
      })
      .from(socialCreditLedger)
      .where(
        and(
          eq(socialCreditLedger.ledgerableType, 'message_vote'),
          inArray(socialCreditLedger.ledgerableId, messageIds)
        )
      )
  ]);

  const filesByMessage = fileRows.reduce<Record<number, TFile[]>>(
    (acc, row) => {
      if (!acc[row.messageId]) {
        acc[row.messageId] = [];
      }

      const rowCopy: TFile = { ...row.file };

      if (channel.private) {
        rowCopy._accessToken = generateFileToken(
          row.file.id,
          channel.fileAccessToken
        );
      }

      acc[row.messageId]!.push(rowCopy);

      return acc;
    },
    {}
  );

  const reactionsByMessage = reactionRows.reduce<
    Record<number, TJoinedMessageReaction[]>
  >((acc, r) => {
    const reaction: TJoinedMessageReaction = {
      messageId: r.messageId,
      userId: r.userId,
      emoji: r.emoji,
      createdAt: r.createdAt,
      fileId: r.fileId,
      file: r.file
    };

    if (!acc[r.messageId]) {
      acc[r.messageId] = [];
    }

    acc[r.messageId]!.push(reaction);

    return acc;
  }, {});

  const scVotesByMessage = scVoteRows.reduce<Record<number, TMessageScVote[]>>(
    (acc, r) => {
      if (r.ledgerableId == null || r.voterId == null) return acc;

      if (!acc[r.ledgerableId]) {
        acc[r.ledgerableId] = [];
      }

      acc[r.ledgerableId]!.push({
        voterId: r.voterId,
        value: r.amount
      });

      return acc;
    },
    {}
  );

  const replyToIds = rows
    .map((m) => m.replyToMessageId)
    .filter((id): id is number => id != null);

  let replyToByMessage: Record<
    number,
    { id: number; content: string | null; userId: number }
  > = {};

  if (replyToIds.length > 0) {
    const replyToRows = await db
      .select({
        id: messages.id,
        content: messages.content,
        userId: messages.userId
      })
      .from(messages)
      .where(inArray(messages.id, replyToIds));

    replyToByMessage = replyToRows.reduce<typeof replyToByMessage>(
      (acc, row) => {
        acc[row.id] = row;
        return acc;
      },
      {}
    );
  }

  return rows.map((msg) => ({
    ...msg,
    files: filesByMessage[msg.id] ?? [],
    reactions: reactionsByMessage[msg.id] ?? [],
    scVotes: scVotesByMessage[msg.id] ?? [],
    replyTo: msg.replyToMessageId
      ? (replyToByMessage[msg.replyToMessageId] ?? null)
      : null
  }));
};

export {
  getMessage,
  getMessageByFileId,
  getNonDirectMessagesFromUserId,
  getReaction,
  joinMessagesWithRelations
};
